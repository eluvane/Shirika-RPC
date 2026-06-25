import Std
import Shirika.Generated.Constants


set_option autoImplicit false

namespace Shirika
namespace Align

def headerSize : Nat := Shirika.Generated.Constants.headerSize

def paddingTo8 (n : Nat) : Nat :=
  (8 - n % 8) % 8

def align8Spec (n : Nat) : Nat :=
  n + paddingTo8 n

def frameSize (payloadLength : Nat) : Nat :=
  align8Spec (headerSize + payloadLength)

def framePadding (payloadLength : Nat) : Nat :=
  paddingTo8 (headerSize + payloadLength)

private theorem padding_mod8_zero_of_lt {r : Nat} (hr : r < 8) :
    (r + ((8 - r) % 8)) % 8 = 0 := by
  cases r with
  | zero => decide
  | succ r =>
      cases r with
      | zero => decide
      | succ r =>
          cases r with
          | zero => decide
          | succ r =>
              cases r with
              | zero => decide
              | succ r =>
                  cases r with
                  | zero => decide
                  | succ r =>
                      cases r with
                      | zero => decide
                      | succ r =>
                          cases r with
                          | zero => decide
                          | succ r =>
                              cases r with
                              | zero => decide
                              | succ r => omega

theorem paddingTo8_lt_8 (n : Nat) : paddingTo8 n < 8 := by
  unfold paddingTo8
  exact Nat.mod_lt _ (by decide)

theorem align8Spec_ge (n : Nat) : n <= align8Spec n := by
  unfold align8Spec
  omega

theorem align8Spec_lt_add8 (n : Nat) : align8Spec n < n + 8 := by
  unfold align8Spec
  have hPad : paddingTo8 n < 8 := paddingTo8_lt_8 n
  omega

theorem align8Spec_mod8 (n : Nat) : align8Spec n % 8 = 0 := by
  unfold align8Spec paddingTo8
  rw [Nat.add_mod]
  simp only [Nat.mod_mod]
  exact padding_mod8_zero_of_lt (Nat.mod_lt n (by decide))

theorem frameSize_ge_header_payload (payloadLength : Nat) :
    headerSize + payloadLength <= frameSize payloadLength := by
  unfold frameSize
  exact align8Spec_ge _

theorem framePadding_lt_8 (payloadLength : Nat) : framePadding payloadLength < 8 := by
  unfold framePadding
  exact paddingTo8_lt_8 _

theorem frameSize_lt_header_payload_add8 (payloadLength : Nat) :
    frameSize payloadLength < headerSize + payloadLength + 8 := by
  unfold frameSize
  exact align8Spec_lt_add8 _

theorem frameSize_mod8 (payloadLength : Nat) : frameSize payloadLength % 8 = 0 := by
  unfold frameSize
  exact align8Spec_mod8 _

theorem frameSize_eq_header_payload_add_padding (payloadLength : Nat) :
    frameSize payloadLength = headerSize + payloadLength + framePadding payloadLength := by
  rfl

end Align
end Shirika
