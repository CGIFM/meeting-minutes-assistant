import logging
import threading
from typing import Optional
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

logger = logging.getLogger(__name__)

_engine: Optional["ASREngine"] = None
_engine_lock = threading.Lock()

# 支持的 ASR 模型
ASR_MODELS = {
    "sensevoice": {
        "name": "SenseVoice (推荐·中文优化)",
        "model": "iic/SenseVoiceSmall",
        "need_punc": False,
    },
    "paraformer": {
        "name": "Paraformer-large (高精度)",
        "model": "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        "need_punc": True,
    },
    "whisper-large": {
        "name": "Whisper-large-v3 (多语言)",
        "model": "/Users/cgifm/.cache/whisper/large-v3" if False else "iic/SenseVoiceSmall",  # fallback
        "need_punc": False,
    },
}


class ASREngine:
    def __init__(self):
        self.model = None
        self.loaded = False
        self.current_model_key = ""
        self._load_lock = threading.Lock()

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
                    "vad_model": "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
                    "vad_kwargs": {"max_single_segment_time": 30000},
                    "device": device,
                    "hub": "ms",
                    "disable_update": True,
                }
                if config["need_punc"]:
                    kwargs["punc_model"] = "iic/ct-punc"
                else:
                    kwargs["spk_model"] = "cam++"

                self.model = AutoModel(**kwargs)
                self.loaded = True
                self.current_model_key = model_key
                logger.info("ASR 模型加载完成: %s (device=%s)", config["name"], device)
            except Exception as e:
                if device == "mps":
                    logger.warning(f"MPS 加载失败，回退到 CPU: {e}")
                    self.load(device="cpu", hotwords=hotwords, model_key=model_key)
                else:
                    raise

    def transcribe(self, audio_path: str, hotwords: str = "", on_segment=None, model_key: str = "sensevoice") -> dict:
        # 用锁串行 transcribe 调用：FunASR AutoModel 不是线程安全的，
        # 并发调用会导致 torch forward 互相阻塞、模型状态错乱
        with _engine_lock:
            if not self.loaded or self.current_model_key != model_key:
                self.load(model_key=model_key)
            result = self.model.generate(
                input=audio_path,
                batch_size_s=300,
                hotword=hotwords if hotwords else None,
                merge_vad=True,
                merge_length_s=15,
            )

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
    return _engine
