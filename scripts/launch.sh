#!/bin/bash
# scripts/launch.sh - Production server control with foreground/background toggle

LOG_FILE="error.log"
PID_FILE=".server.pid"

start_background() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo "Server already running (PID: $(cat $PID_FILE))"
        return 1
    fi
    echo "Starting server in background..."
    nohup node server.js >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Server started (PID: $(cat $PID_FILE))"
    echo "Logs: tail -f $LOG_FILE"
}

stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo "Server stopped (PID: $PID)"
        fi
        rm -f "$PID_FILE"
    else
        echo "No server running"
    fi
}

case "$1" in
    start)
        start_background
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 1
        start_background
        ;;
    foreground|fg)
        echo "Running in foreground (Ctrl+C to stop)..."
        node server.js 2>&1 | tee -a "$LOG_FILE"
        ;;
    logs)
        tail -f "$LOG_FILE"
        ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
            echo "Server running (PID: $(cat $PID_FILE))"
        else
            echo "Server not running"
        fi
        ;;
    *)
        echo "Usage: ./launch.sh {start|stop|restart|foreground|logs|status}"
        echo ""
        echo "Commands:"
        echo "  start       Start server in background"
        echo "  stop        Stop background server"
        echo "  restart     Restart background server"
        echo "  foreground  Run in foreground (Ctrl+C to stop)"
        echo "  logs        Tail error.log"
        echo "  status      Check if server is running"
        ;;
esac
