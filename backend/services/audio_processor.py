import os
import shutil
import subprocess
import tempfile
from pathlib import Path

# Swift GUI 启动 Python 时 PATH 可能只有 /usr/bin:/bin，找不到 homebrew 装的 ffmpeg
# 启动时主动把常见路径加进来
for _p in ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/local/sbin']:
    if os.path.isdir(_p) and _p not in os.environ.get('PATH', ''):
        os.environ['PATH'] = _p + os.pathsep + os.environ.get('PATH', '')


SUPPORTED_FORMATS = {".mp3", ".wav", ".m4a", ".mp4", ".flac", ".ogg", ".webm", ".aac", ".wma"}


def _find_ffmpeg() -> str:
    """找到可执行的 ffmpeg 路径。找不到就抛错给前端友好提示。"""
    p = shutil.which('ffmpeg')
    if p:
        return p
    # 兜底：直接试常见绝对路径
    for cand in ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']:
        if os.path.exists(cand):
            return cand
    raise FileNotFoundError(
        "未找到 ffmpeg。请用 `brew install ffmpeg` 安装，或把它加入 PATH。"
    )


def is_supported(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_FORMATS


def convert_to_wav(input_path: str, output_path: str = None) -> str:
    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav")

    cmd = [
        _find_ffmpeg(), "-y", "-i", input_path,
        "-ar", "16000",
        "-ac", "1",
        "-f", "wav",
        output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path


def get_audio_duration(input_path: str) -> float:
    """获取音频时长（秒）。多次尝试，对 WebM 容器没有 duration tag 的情况降级到估算。"""
    ffmpeg_bin = _find_ffmpeg()
    ffprobe_bin = ffmpeg_bin.replace('/ffmpeg', '/ffprobe')  # 同目录

    # 优先用 ffprobe format=duration
    cmd = [
        ffprobe_bin, "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        out = result.stdout.strip()
        if out and out != "N/A":
            return float(out)
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        pass

    # 降级方案 1：解码整段音频，统计样本数
    cmd2 = [
        ffmpeg_bin, "-v", "error", "-i", input_path,
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
