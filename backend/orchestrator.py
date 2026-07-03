"""
Agent 编排器：统一的异步任务队列。
- 一个后台 worker 线程池消费 agent_tasks。
- 每个 task_type 映射到 agents.py 中的一个处理函数。
- 通过 per-task SSE 队列向前端实时推送 progress / message / done / error。
- 重试策略对齐 PRD §6.3。
"""

import queue
import threading
import traceback

import store

# task_id → SSE 事件队列（前端订阅用）
_sse_queues: dict[str, queue.Queue] = {}
_sse_lock = threading.Lock()

# 待执行任务队列（task_id）
_work_q: "queue.Queue[str]" = queue.Queue()

# 取消标记
_cancelled: set[str] = set()

# task_type → (handler, max_retries)
_REGISTRY: dict[str, tuple] = {}


def register(task_type: str, handler, max_retries: int = 0):
    _REGISTRY[task_type] = (handler, max_retries)


def _get_sse(tid: str) -> queue.Queue:
    with _sse_lock:
        q = _sse_queues.get(tid)
        if q is None:
            q = queue.Queue()
            _sse_queues[tid] = q
        return q


def emit(tid: str, **event):
    """Agent 内部调用，推送进度事件并落库 progress/message。"""
    if "progress" in event or "message" in event:
        store.update_task(
            tid,
            progress=event.get("progress", store.get_task(tid).get("progress", 0)),
            message=event.get("message", ""),
        )
    _get_sse(tid).put(event)


def sse_stream(tid: str):
    """生成器：产出 SSE data 行。done/error 后结束。"""
    import json
    q = _get_sse(tid)
    # 先补发当前状态，避免前端错过早期事件
    t = store.get_task(tid)
    if t:
        yield f"data: {json.dumps({'type': 'status', 'status': t['status'], 'progress': t['progress'], 'message': t['message'], 'result': t.get('result')}, ensure_ascii=False)}\n\n"
        if t["status"] in ("succeeded", "failed", "cancelled"):
            yield f"data: {json.dumps({'type': t['status'], 'result': t.get('result'), 'error': t.get('error')}, ensure_ascii=False)}\n\n"
            return
    while True:
        try:
            ev = q.get(timeout=30)
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
            if ev.get("type") in ("succeeded", "failed", "cancelled", "done", "error"):
                break
        except queue.Empty:
            yield f"data: {json.dumps({'type': 'heartbeat'}, ensure_ascii=False)}\n\n"
            t = store.get_task(tid)
            if t and t["status"] in ("succeeded", "failed", "cancelled"):
                break


def submit(task_type: str, project_id=None, episode_id=None, input_data=None) -> dict:
    """创建任务并入队，立即返回任务记录。"""
    task = store.create_task(task_type, project_id, episode_id, input_data)
    _work_q.put(task["task_id"])
    return task


def cancel(tid: str):
    _cancelled.add(tid)
    store.update_task(tid, status="cancelled", message="已取消")
    _get_sse(tid).put({"type": "cancelled"})


def _run_task(tid: str):
    task = store.get_task(tid)
    if not task:
        return
    if tid in _cancelled:
        return
    task_type = task["task_type"]
    entry = _REGISTRY.get(task_type)
    if not entry:
        store.update_task(tid, status="failed",
                          error={"code": "UNKNOWN_TASK", "message": f"未知任务类型 {task_type}"})
        _get_sse(tid).put({"type": "failed", "error": {"code": "UNKNOWN_TASK", "message": task_type}})
        return

    handler, max_retries = entry
    store.update_task(tid, status="running", progress=1, message="开始执行")
    emit(tid, type="status", status="running", progress=1, message="开始执行")

    attempt = 0
    while True:
        if tid in _cancelled:
            return
        try:
            result = handler(task, lambda **e: emit(tid, **e)) or {}
            store.update_task(tid, status="succeeded", progress=100,
                              message="完成", result=result)
            emit(tid, type="succeeded", progress=100, result=result)
            return
        except Exception as e:
            attempt += 1
            err = {"code": "AGENT_ERROR", "message": str(e),
                   "detail": traceback.format_exc()[-800:]}
            if attempt <= max_retries:
                emit(tid, type="status", message=f"失败重试 {attempt}/{max_retries}: {e}")
                continue
            store.update_task(tid, status="failed", error=err)
            emit(tid, type="failed", error=err)
            print(f"[orchestrator] task {tid} ({task_type}) 失败: {e}", flush=True)
            return


def _worker(worker_id: int):
    while True:
        tid = _work_q.get()
        try:
            _run_task(tid)
        except Exception as e:
            print(f"[orchestrator] worker{worker_id} 异常: {e}", flush=True)
        finally:
            _work_q.task_done()


_started = False


def start_workers(n: int = 3):
    global _started
    if _started:
        return
    _started = True
    for i in range(n):
        threading.Thread(target=_worker, args=(i,), daemon=True).start()
    print(f"[orchestrator] {n} 个 worker 已启动", flush=True)
