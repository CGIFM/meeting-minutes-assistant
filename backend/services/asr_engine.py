import logging
from typing import Optional
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

logger = logging.getLogger(__name__)

_engine: Optional["ASREngine"] = None


class ASREngine:
    def __init__(self):
        self.model = None
        self.loaded = False

    def load(self, device: str = "mps", hotwords: str = ""):
        try:
            self.model = AutoModel(
                model="iic/SenseVoiceSmall",
                vad_model="iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
                vad_kwargs={"max_single_segment_time": 30000},
                spk_model="cam++",
                device=device,
                hub="ms",
            )
            self.loaded = True
            logger.info(f"ASR 模型加载完成 (device={device})")
        except Exception as e:
            if device == "mps":
                logger.warning(f"MPS 加载失败，回退到 CPU: {e}")
                self.load(device="cpu", hotwords=hotwords)
            else:
                raise

    def transcribe(self, audio_path: str, hotwords: str = "") -> dict:
        if not self.loaded:
            self.load()

        result = self.model.generate(
            input=audio_path,
            batch_size_s=300,
            hotword=hotwords if hotwords else None,
            merge_vad=True,
            merge_length_s=15,
        )

        return self._format_result(result)

    def _format_result(self, result) -> dict:
        if not result or not result[0]:
            return {"segments": [], "full_text": ""}

        segments = []
        full_text_parts = []

        item = result[0]
        if "sentence_info" in item:
            for seg in item["sentence_info"]:
                start_ms = seg.get("start", 0)
                end_ms = seg.get("end", 0)
                speaker = seg.get("spk", 0)
                text = rich_transcription_postprocess(seg.get("sentence", ""))

                segments.append({
                    "start": start_ms / 1000,
                    "end": end_ms / 1000,
                    "speaker": f"说话人{speaker + 1}",
                    "text": text,
                })
                full_text_parts.append(f"[{self._format_time(start_ms)}] 说话人{speaker + 1}: {text}")
        else:
            text = rich_transcription_postprocess(item.get("text", ""))
            segments.append({
                "start": 0,
                "end": 0,
                "speaker": "说话人1",
                "text": text,
            })
            full_text_parts.append(text)

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
