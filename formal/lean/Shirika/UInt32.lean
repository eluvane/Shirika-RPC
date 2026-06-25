import Std


set_option autoImplicit false

namespace Shirika
namespace UInt32

def modulus : Nat := 4294967296

def normalize (n : Nat) : Nat :=
  n % modulus

def seqDiff (readSeq writeSeq : Nat) : Nat :=
  normalize (writeSeq + modulus - normalize readSeq)

def freeBytes (capacityBytes usedBytes : Nat) : Nat :=
  capacityBytes - usedBytes

theorem normalize_lt_modulus (n : Nat) : normalize n < modulus := by
  unfold normalize modulus
  exact Nat.mod_lt n (by decide)

theorem normalize_idempotent (n : Nat) : normalize (normalize n) = normalize n := by
  unfold normalize
  exact Nat.mod_eq_of_lt (normalize_lt_modulus n)

theorem seqDiff_lt_modulus (readSeq writeSeq : Nat) : seqDiff readSeq writeSeq < modulus := by
  unfold seqDiff
  exact normalize_lt_modulus _

theorem used_plus_free_eq_capacity {capacityBytes usedBytes : Nat}
    (hUsed : usedBytes <= capacityBytes) :
    usedBytes + freeBytes capacityBytes usedBytes = capacityBytes := by
  unfold freeBytes
  exact Nat.add_sub_of_le hUsed

theorem freeBytes_le_capacity (capacityBytes usedBytes : Nat) :
    freeBytes capacityBytes usedBytes <= capacityBytes := by
  unfold freeBytes
  exact Nat.sub_le capacityBytes usedBytes

theorem usedBytes_bounded_by_modulus {capacityBytes usedBytes : Nat}
    (hCapacity : capacityBytes < modulus) (hUsed : usedBytes <= capacityBytes) :
    usedBytes < modulus := by
  exact Nat.lt_of_le_of_lt hUsed hCapacity

end UInt32
end Shirika
