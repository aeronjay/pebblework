import { Board } from '../features/board/components/Board'
import { BoardNotFound, BoardSkeleton } from '../features/board/components/BoardStates'
import { useBoard } from '../features/board/hooks'
import { ToastProvider } from '../features/quests/components/Toast'

// Kanban board for a project quest (#/quests/:id).
export function BoardScreen({ id }: { id: string }) {
  return (
    <ToastProvider>
      <BoardRoute id={id} />
    </ToastProvider>
  )
}

function BoardRoute({ id }: { id: string }) {
  const board = useBoard(id)
  if (board === undefined) return <BoardSkeleton />
  if (board === null) return <BoardNotFound />
  return <Board board={board} />
}
