import logging
import threading
import time
from pathlib import Path
from typing import Optional
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

logger = logging.getLogger(__name__)

_engine: Optional["ASREngine"] = None
_engine_lock = threading.Lock()

# 空闲多久后卸载模型（秒）
IDLE_UNLOAD_AFTER = 300  # 5 分钟

# 支持的 ASR 模型
# model 字段优先用本地缓存绝对路径，避免每次启动都联网校验 + registry 查询
# 如果路径不存在，FunASR 会回退到 hub 下载
_SENSEVOICE_LOCAL = str(Path.home() / ".cache/modelscope/hub/models/iic/SenseVoiceSmall")
_VAD_LOCAL = str(Path.home() / ".cache/modelscope/hub/models/iic/speech_fsmn_vad_zh-cn-16k-common-pytorch")
_PUNC_LOCAL = str(Path.home() / ".cache/modelscope/hub/models/iic/ct-punc")
_SPK_LOCAL = str(Path.home() / ".cache/modelscope/hub/models/iic/speech_campplus_sv_zh-cn_16k-common")
_PARAFORMER_REMOTE = "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch"

ASR_MODELS = {
    "sensevoice": {
        "name": "SenseVoice (推荐·中文优化)",
        "model": _SENSEVOICE_LOCAL,
        "vad_model": _VAD_LOCAL,
        "need_punc": False,
    },
    "paraformer": {
        "name": "Paraformer-large (高精度)",
        "model": _PARAFORMER_REMOTE,
        "vad_model": _VAD_LOCAL,
        "need_punc": True,
    },
    "whisper-large": {
        "name": "Whisper-large-v3 (多语言)",
        "model": _SENSEVOICE_LOCAL,  # 暂用 SenseVoice 替代
        "vad_model": _VAD_LOCAL,
        "need_punc": False,
    },
}


class ASREngine:
    def __init__(self):
        self.model = None
        self.loaded = False
        self.current_model_key = ""
        self._load_lock = threading.Lock()
        self._last_used = 0.0  # 上次 transcribe 时间戳
        self._unload_lock = threading.Lock()

    def load(self, device: str = "mps", hotwords: str = "", model_key: str = "sensevoice"):
        # 双重检查 + 锁，避免并发重复加载（chunk ASR + full ASR 同时进来）
        if self.loaded and self.current_model_key == model_key:
            return
        with self._load_lock:
            if self.loaded and self.current_model_key == model_key:
                return
            logger.info("开始加载 ASR 模型: %s (device=%s)", model_key, device)

            config = ASR_MODELS.get(model_key, ASR_MODELS["sensevoice"])
            try:
                kwargs = {
                    "model": config["model"],
                    "vad_model": config.get("vad_model", _VAD_LOCAL),
                    "vad_kwargs": {"max_single_segment_time": 30000},
                    "device": device,
                    "hub": "ms",
                }
                if config["need_punc"]:
                    # ct-punc 没本地缓存时回退到 modelscope ID
                    punc_path = Path(_PUNC_LOCAL)
                    kwargs["punc_model"] = _PUNC_LOCAL if punc_path.exists() else "iic/ct-punc"
                else:
                    # SPK (CAM++) 优先用本地缓存，绕过 SSL 问题
                    spk_path = Path(_SPK_LOCAL)
                    kwargs["spk_model"] = _SPK_LOCAL if spk_path.exists() else "cam++"

                self.model = AutoModel(**kwargs)
                self.loaded = True
                self.current_model_key = model_key
                self._last_used = time.time()
                logger.info("ASR 模型加载完成: %s (device=%s)", config["name"], device)
            except Exception as e:
                if device == "mps":
                    logger.warning(f"MPS 加载失败，回退到 CPU: {e}")
                    self.load(device="cpu", hotwords=hotwords, model_key=model_key)
                else:
                    raise

    def unload_if_idle(self) -> bool:
        """如果距离上次调用超过 IDLE_UNLOAD_AFTER，释放模型。
        返回 True 表示已卸载。线程安全。
        """
        with self._unload_lock:
            if not self.loaded:
                return False
            idle = time.time() - self._last_used
            if idle < IDLE_UNLOAD_AFTER:
                return False
            logger.info("ASR 模型空闲 %.0f 秒，卸载释放内存", idle)
            try:
                # 释放 model 持有的 torch tensors
                del self.model
                self.model = None
                self.loaded = False
                self.current_model_key = ""
                # 触发 Python GC + torch 显存释放
                import gc
                gc.collect()
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
                logger.info("ASR 模型已卸载")
                return True
            except Exception as e:
                logger.warning("卸载模型失败: %s", e)
                return False

    def transcribe(self, audio_path: str, hotwords: str = "", on_segment=None, model_key: str = "sensevoice") -> dict:
        # 用锁串行 transcribe 调用：FunASR AutoModel 不是线程安全的，
        # 并发调用会导致 torch forward 互相阻塞、模型状态错乱
        with _engine_lock:
            if not self.loaded or self.current_model_key != model_key:
                self.load(model_key=model_key)
            self._last_used = time.time()
            result = self.model.generate(
                input=audio_path,
                batch_size_s=300,
                hotword=hotwords if hotwords else None,
                merge_vad=True,
                merge_length_s=15,
            )
            self._last_used = time.time()

        return self._format_result(result, on_segment)

    def _format_result(self, result, on_segment=None) -> dict:
        if not result or not result[0]:
            return {"segments": [], "full_text": ""}

        segments = []
        full_text_parts = []

        item = result[0]
        if "sentence_info" in item:
            for idx, seg in enumerate(item["sentence_info"]):
                start_ms = seg.get("start", 0)
                end_ms = seg.get("end", 0)
                speaker = seg.get("spk", 0)
                text = rich_transcription_postprocess(seg.get("sentence", ""))

                segment = {
                    "start": start_ms / 1000,
                    "end": end_ms / 1000,
                    "speaker": f"说话人{speaker + 1}",
                    "text": text,
                }
                segments.append(segment)
                full_text_parts.append(f"[{self._format_time(start_ms)}] 说话人{speaker + 1}: {text}")

                if on_segment:
                    on_segment(segment, idx, len(item["sentence_info"]))
        else:
            text = rich_transcription_postprocess(item.get("text", ""))
            segment = {
                "start": 0,
                "end": 0,
                "speaker": "说话人1",
                "text": text,
            }
            segments.append(segment)
            full_text_parts.append(text)

            if on_segment:
                on_segment(segment, 0, 1)

        return {
            "segments": segments,
            "full_text": "\n".join(full_text_parts),
        }

    def _format_time(self, ms: int) -> str:
        total_seconds = int(ms / 1000)
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        if hours > 0:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        return f"{minutes}:{seconds:02d}"


def get_engine() -> ASREngine:
    global _engine
    if _engine is None:
        _engine = ASREngine()
        _start_watchdog()
    return _engine


_watchdog_started = False
_watchdog_lock = threading.Lock()


def _start_watchdog():
    """启动后台线程：每 60 秒检查一次是否需要卸载空闲模型。"""
    global _watchdog_started
    with _watchdog_lock:
        if _watchdog_started:
            return
        _watchdog_started = True

    def _watch():
        while True:
            time.sleep(60)
            try:
                if _engine is not None:
                    _engine.unload_if_idle()
            except Exception as e:
                logger.warning("watchdog 卸载检查失败: %s", e)

    t = threading.Thread(target=_watch, daemon=True, name="asr-watchdog")
    t.start()
    logger.info("ASR 空闲卸载 watchdog 已启动（%d 秒无活动将卸载）", IDLE_UNLOAD_AFTER)
