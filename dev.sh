#!/bin/bash
# 会议纪要助手 - 开发模式启动脚本

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🎙️  会议纪要助手 - 启动中..."

# 启动 Python 后端
echo "  启动后端..."
cd "$DIR/backend"
source .venv/bin/activate
python main.py &
BACKEND_PID=$!

# 等待后端就绪
sleep 2
PORT=$(grep -o 'PORT=[0-9]*' /dev/stdin <<< "$(head -1 /proc/$BACKEND_PID/fd/1 2>/dev/null)" || echo "")

# 启动前端
echo "  启动前端..."
cd "$DIR"
npx vite --open &
FRONTEND_PID=$!

echo "  ✅ 就绪！"
echo "  前端: http://localhost:5173"
echo ""
echo "  按 Ctrl+C 退出"

cleanup() {
    echo ""
    echo "  关闭中..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

wait
