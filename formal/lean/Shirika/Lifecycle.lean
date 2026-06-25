import Std
import Shirika.Generated.Constants


set_option autoImplicit false

namespace Shirika
namespace Lifecycle

inductive TerminalClass where
  | completed
  | failed
  | timedOut
  | cancelled
  deriving DecidableEq, Repr

inductive CancelCode where
  | clientAbort
  | timeout
  | clientClose
  deriving DecidableEq, Repr

inductive CloseCause where
  | localClose
  | peerClose
  deriving DecidableEq, Repr

inductive LifecycleEvent where
  | responseOk
  | responseErr
  | sendFailure
  | cancel (code : CancelCode)
  | deadlineExpired
  | close (cause : CloseCause)
  deriving DecidableEq, Repr

def classifyCancel : CancelCode → TerminalClass
  | CancelCode.clientAbort => TerminalClass.cancelled
  | CancelCode.timeout => TerminalClass.timedOut
  | CancelCode.clientClose => TerminalClass.cancelled

def cancelCodeValue : CancelCode → Nat
  | CancelCode.clientAbort => Shirika.Generated.Constants.cancelCodeClientAbort
  | CancelCode.timeout => Shirika.Generated.Constants.cancelCodeTimeout
  | CancelCode.clientClose => Shirika.Generated.Constants.cancelCodeClientClose

def decodeCancelCode (value : Nat) : Option CancelCode :=
  if value = Shirika.Generated.Constants.cancelCodeClientAbort then
    some CancelCode.clientAbort
  else if value = Shirika.Generated.Constants.cancelCodeTimeout then
    some CancelCode.timeout
  else if value = Shirika.Generated.Constants.cancelCodeClientClose then
    some CancelCode.clientClose
  else
    none

def classifyCancelCodeValue (value : Nat) : Option TerminalClass :=
  match decodeCancelCode value with
  | some code => some (classifyCancel code)
  | none => none

def classifyEvent : LifecycleEvent → TerminalClass
  | LifecycleEvent.responseOk => TerminalClass.completed
  | LifecycleEvent.responseErr => TerminalClass.failed
  | LifecycleEvent.sendFailure => TerminalClass.failed
  | LifecycleEvent.cancel code => classifyCancel code
  | LifecycleEvent.deadlineExpired => TerminalClass.timedOut
  | LifecycleEvent.close _ => TerminalClass.cancelled

inductive RequestState where
  | pending
  | terminal (outcome : TerminalClass)
  deriving DecidableEq, Repr

def terminalCount : RequestState → Nat
  | RequestState.pending => 0
  | RequestState.terminal _ => 1

def step (state : RequestState) (event : LifecycleEvent) : RequestState :=
  match state with
  | RequestState.pending => RequestState.terminal (classifyEvent event)
  | RequestState.terminal outcome => RequestState.terminal outcome

def PendingSet := Nat → Bool

namespace PendingSet

def empty : PendingSet :=
  fun _ => false

def contains (pending : PendingSet) (requestId : Nat) : Bool :=
  pending requestId

def insert (pending : PendingSet) (requestId : Nat) : PendingSet :=
  fun candidate => if candidate = requestId then true else pending candidate

def release (pending : PendingSet) (requestId : Nat) : PendingSet :=
  fun candidate => if candidate = requestId then false else pending candidate

def allocatedFresh (pending : PendingSet) (requestId : Nat) : Prop :=
  requestId ≠ 0 ∧ contains pending requestId = false

theorem allocatedFresh_not_pending (pending : PendingSet) (requestId : Nat)
    (hFresh : allocatedFresh pending requestId) :
    contains pending requestId = false :=
  hFresh.2

theorem allocatedFresh_nonzero (pending : PendingSet) (requestId : Nat)
    (hFresh : allocatedFresh pending requestId) :
    requestId ≠ 0 :=
  hFresh.1

theorem insert_contains_inserted (pending : PendingSet) (requestId : Nat) :
    contains (insert pending requestId) requestId = true := by
  simp [contains, insert]

theorem insert_preserves_other (pending : PendingSet) (requestId otherId : Nat)
    (hOther : otherId ≠ requestId) :
    contains (insert pending requestId) otherId = contains pending otherId := by
  simp [contains, insert, hOther]

theorem insert_after_allocation_establishes_witness (pending : PendingSet) (requestId : Nat)
    (hFresh : allocatedFresh pending requestId) :
    contains (insert pending requestId) requestId = true ∧
      contains pending requestId = false ∧ requestId ≠ 0 := by
  exact ⟨insert_contains_inserted pending requestId, hFresh.2, hFresh.1⟩

theorem release_removes_known (pending : PendingSet) (requestId : Nat) :
    contains (release pending requestId) requestId = false := by
  simp [contains, release]

theorem release_preserves_other (pending : PendingSet) (requestId otherId : Nat)
    (hOther : otherId ≠ requestId) :
    contains (release pending requestId) otherId = contains pending otherId := by
  simp [contains, release, hOther]

theorem release_known_pending_removes_exactly_one (pending : PendingSet) (requestId : Nat)
    (_hPending : contains pending requestId = true) :
    contains (release pending requestId) requestId = false ∧
      (∀ otherId, otherId ≠ requestId →
        contains (release pending requestId) otherId = contains pending otherId) := by
  exact ⟨release_removes_known pending requestId, fun otherId hOther =>
    release_preserves_other pending requestId otherId hOther⟩

theorem release_idempotent (pending : PendingSet) (requestId : Nat) :
    release (release pending requestId) requestId = release pending requestId := by
  funext candidate
  by_cases hCandidate : candidate = requestId
  · simp [release, hCandidate]
  · simp [release, hCandidate]

end PendingSet

theorem pending_step_terminal_count (event : LifecycleEvent) :
    terminalCount (step RequestState.pending event) = 1 := by
  rfl

theorem terminal_step_idempotent (outcome : TerminalClass) (event : LifecycleEvent) :
    step (RequestState.terminal outcome) event = RequestState.terminal outcome := by
  rfl

theorem pending_terminal_exactly_once (first second : LifecycleEvent) :
    step (step RequestState.pending first) second = step RequestState.pending first ∧
      terminalCount (step (step RequestState.pending first) second) = 1 := by
  exact ⟨rfl, rfl⟩

theorem cancel_classification_total (code : CancelCode) :
    classifyCancel code = TerminalClass.timedOut ∨
      classifyCancel code = TerminalClass.cancelled := by
  cases code <;> simp [classifyCancel]

theorem decodeCancelCode_cancelCodeValue (code : CancelCode) :
    decodeCancelCode (cancelCodeValue code) = some code := by
  cases code <;> simp [decodeCancelCode, cancelCodeValue,
    Shirika.Generated.Constants.cancelCodeClientAbort,
    Shirika.Generated.Constants.cancelCodeTimeout,
    Shirika.Generated.Constants.cancelCodeClientClose]

theorem classifyCancelCodeValue_cancelCodeValue (code : CancelCode) :
    classifyCancelCodeValue (cancelCodeValue code) = some (classifyCancel code) := by
  simp [classifyCancelCodeValue, decodeCancelCode_cancelCodeValue]

theorem timeout_value_classifies_timedOut :
    classifyCancelCodeValue Shirika.Generated.Constants.cancelCodeTimeout =
      some TerminalClass.timedOut := by
  simp [classifyCancelCodeValue, decodeCancelCode, classifyCancel,
    Shirika.Generated.Constants.cancelCodeClientAbort,
    Shirika.Generated.Constants.cancelCodeTimeout]

theorem clientAbort_value_classifies_cancelled :
    classifyCancelCodeValue Shirika.Generated.Constants.cancelCodeClientAbort =
      some TerminalClass.cancelled := by
  simp [classifyCancelCodeValue, decodeCancelCode, classifyCancel,
    Shirika.Generated.Constants.cancelCodeClientAbort]

theorem clientClose_value_classifies_cancelled :
    classifyCancelCodeValue Shirika.Generated.Constants.cancelCodeClientClose =
      some TerminalClass.cancelled := by
  simp [classifyCancelCodeValue, decodeCancelCode, classifyCancel,
    Shirika.Generated.Constants.cancelCodeClientAbort,
    Shirika.Generated.Constants.cancelCodeTimeout,
    Shirika.Generated.Constants.cancelCodeClientClose]

theorem event_classification_total (event : LifecycleEvent) :
    ∃ outcome, classifyEvent event = outcome := by
  exact ⟨classifyEvent event, rfl⟩

theorem deadlineExpired_classifies_timedOut :
    classifyEvent LifecycleEvent.deadlineExpired = TerminalClass.timedOut := by
  rfl

theorem close_classifies_cancelled (cause : CloseCause) :
    classifyEvent (LifecycleEvent.close cause) = TerminalClass.cancelled := by
  cases cause <;> rfl

structure ReplyContext where
  cancelled : Bool
  deadlineExpired : Bool
  deriving DecidableEq, Repr

def replyObligation (ctx : ReplyContext) : Prop :=
  ctx.cancelled = false ∧ ctx.deadlineExpired = false

def shouldReply (ctx : ReplyContext) : Bool :=
  match ctx.cancelled, ctx.deadlineExpired with
  | false, false => true
  | _, _ => false

theorem shouldReply_eq_true_iff_replyObligation (ctx : ReplyContext) :
    shouldReply ctx = true ↔ replyObligation ctx := by
  cases ctx with
  | mk cancelled deadlineExpired =>
      cases cancelled <;> cases deadlineExpired <;> simp [shouldReply, replyObligation]

theorem no_reply_needed_after_cancel (ctx : ReplyContext) (hCancelled : ctx.cancelled = true) :
    ¬ replyObligation ctx := by
  intro hObligation
  have hNotCancelled : ctx.cancelled = false := hObligation.1
  rw [hCancelled] at hNotCancelled
  cases hNotCancelled

theorem no_reply_needed_after_deadline (ctx : ReplyContext)
    (hExpired : ctx.deadlineExpired = true) :
    ¬ replyObligation ctx := by
  intro hObligation
  have hNotExpired : ctx.deadlineExpired = false := hObligation.2
  rw [hExpired] at hNotExpired
  cases hNotExpired

structure QueueState where
  maxQueuedRequests : Nat
  queuedRequests : Nat
  queued_le_max : queuedRequests <= maxQueuedRequests

namespace QueueState

def empty (maxQueuedRequests : Nat) : QueueState :=
  { maxQueuedRequests := maxQueuedRequests,
    queuedRequests := 0,
    queued_le_max := Nat.zero_le maxQueuedRequests }

def enqueue (queue : QueueState) : QueueState :=
  if hCanQueue : queue.queuedRequests < queue.maxQueuedRequests then
    { maxQueuedRequests := queue.maxQueuedRequests,
      queuedRequests := queue.queuedRequests + 1,
      queued_le_max := Nat.succ_le_of_lt hCanQueue }
  else
    queue

def dequeue (queue : QueueState) : QueueState :=
  { maxQueuedRequests := queue.maxQueuedRequests,
    queuedRequests := queue.queuedRequests - 1,
    queued_le_max := Nat.le_trans (Nat.sub_le queue.queuedRequests 1) queue.queued_le_max }

theorem queuedRequests_never_exceeds_configured_max (queue : QueueState) :
    queue.queuedRequests <= queue.maxQueuedRequests :=
  queue.queued_le_max

theorem enqueue_preserves_bound (queue : QueueState) :
    (enqueue queue).queuedRequests <= (enqueue queue).maxQueuedRequests :=
  (enqueue queue).queued_le_max

theorem dequeue_preserves_bound (queue : QueueState) :
    (dequeue queue).queuedRequests <= (dequeue queue).maxQueuedRequests :=
  (dequeue queue).queued_le_max

theorem enqueue_preserves_configured_max (queue : QueueState) :
    (enqueue queue).maxQueuedRequests = queue.maxQueuedRequests := by
  unfold enqueue
  by_cases hCanQueue : queue.queuedRequests < queue.maxQueuedRequests
  · simp [hCanQueue]
  · simp [hCanQueue]

theorem enqueue_cannot_exceed_configured_max (queue : QueueState) :
    (enqueue queue).queuedRequests <= queue.maxQueuedRequests := by
  have hBound : (enqueue queue).queuedRequests <= (enqueue queue).maxQueuedRequests :=
    (enqueue queue).queued_le_max
  rw [enqueue_preserves_configured_max queue] at hBound
  exact hBound

theorem empty_enqueue_preserves_configured_max (maxQueuedRequests : Nat) :
    (enqueue (empty maxQueuedRequests)).queuedRequests <=
      (enqueue (empty maxQueuedRequests)).maxQueuedRequests :=
  (enqueue (empty maxQueuedRequests)).queued_le_max

end QueueState

end Lifecycle
end Shirika
