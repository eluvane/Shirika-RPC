import Std


set_option autoImplicit false

namespace Shirika
namespace Codec

abbrev Byte := UInt8

structure DecodeResult (α : Type) where
  value : α
  rest : List Byte
  deriving Repr

structure SpecCodec (α : Type) where
  measure : α → Nat
  encode : α → List Byte
  decode : List Byte → Option (DecodeResult α)
  valid : α → Prop := fun _ => True

namespace SpecCodec

structure Lawful {α : Type} (codec : SpecCodec α) : Prop where
  encode_length_eq_measure : ∀ value, codec.valid value → (codec.encode value).length = codec.measure value
  decode_encode : ∀ value suffix, codec.valid value →
    codec.decode (codec.encode value ++ suffix) = some { value := value, rest := suffix }

theorem encode_length_eq_measure {α : Type} {codec : SpecCodec α}
    (lawful : codec.Lawful) (value : α) (hValid : codec.valid value) :
    (codec.encode value).length = codec.measure value :=
  lawful.encode_length_eq_measure value hValid

theorem decode_encode {α : Type} {codec : SpecCodec α} (lawful : codec.Lawful)
    (value : α) (suffix : List Byte) (hValid : codec.valid value) :
    codec.decode (codec.encode value ++ suffix) = some { value := value, rest := suffix } :=
  lawful.decode_encode value suffix hValid

end SpecCodec

def zeroByte : Byte := 0

def encodeSmallLengthPrefix (len : Byte) : List Byte :=
  [len, zeroByte, zeroByte, zeroByte]

def decodeSmallLengthPrefix : List Byte → Option (DecodeResult Byte)
  | b0 :: b1 :: b2 :: b3 :: rest =>
      if b1 = zeroByte ∧ b2 = zeroByte ∧ b3 = zeroByte then
        some { value := b0, rest := rest }
      else
        none
  | _ => none

theorem encodeSmallLengthPrefix_length (len : Byte) :
    (encodeSmallLengthPrefix len).length = 4 := by
  rfl

theorem decodeSmallLengthPrefix_encode (len : Byte) (suffix : List Byte) :
    decodeSmallLengthPrefix (encodeSmallLengthPrefix len ++ suffix) =
      some { value := len, rest := suffix } := by
  simp [decodeSmallLengthPrefix, encodeSmallLengthPrefix, zeroByte]

theorem take_length_append {α : Type} (xs ys : List α) :
    (xs ++ ys).take xs.length = xs := by
  induction xs with
  | nil => rfl
  | cons x xs ih => simp [ih]

theorem drop_length_append {α : Type} (xs ys : List α) :
    (xs ++ ys).drop xs.length = ys := by
  induction xs with
  | nil => rfl
  | cons x xs ih => simp [ih]

end Codec
end Shirika
