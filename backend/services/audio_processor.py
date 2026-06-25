import subprocess
import tempfile
from pathlib import Path


SUPPORTED_FORMATS = {".mp3", ".wav", ".m4a", ".mp4", ".flac", ".ogg", ".webm", ".aac", ".wma"}


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_FORMATS


def convert_to_wav(input_path: str, output_path: str = None) -> str:
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")

    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-ar", "16000",
        "-ac", "1",
        "-f", "wav",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path


def get_audio_duration(input_path: str) -> float:
    """获取音频时长（秒）。多次尝试，对 WebM 容器没有 duration tag 的情况降级到估算。"""
    # 优先用 ffprobe format=duration
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        out = result.stdout.strip()
        if out and out != "N/A":
            return float(out)
    except (subprocess.CalledProcessError, ValueError):
        pass

    # 降级方案 1：解码整段音频，统计样本数
    cmd2 = [
        "ffmpeg", "-v", "error", "-i", input_path,
        "-f", "null", "-",
    ]
    try:
        result = subprocess.run(cmd2, capture_output=True, text=True)
        # ffmpeg 输出 stderr 里包含 "time=00:01:23.45"
        import re
        m = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", result.stderr)
        if m:
            h, mi, s = m[-1]
            return int(h) * 3600 + int(mi) * 60 + float(s)
    except Exception:
        pass

    # 降级方案 2：用文件大小估算（webm/opus 大约 ~6KB/s）
    try:
        size = Path(input_path).stat().st_size
        if size > 0:
            return max(1.0, size / 6144.0)
    except Exception:
        pass

    return 0.0
