import Shirika.Codec.Core


set_option autoImplicit false

namespace Shirika
namespace Codec
namespace Builtins

structure U16LE where
  b0 : Byte
  b1 : Byte
  deriving Repr

structure U32LE where
  b0 : Byte
  b1 : Byte
  b2 : Byte
  b3 : Byte
  deriving Repr

structure I32LE where
  b0 : Byte
  b1 : Byte
  b2 : Byte
  b3 : Byte
  deriving Repr

structure BytesValue where
  lengthByte : Byte
  data : List Byte
  deriving Repr

namespace BytesValue

def Valid (value : BytesValue) : Prop :=
  value.data.length = value.lengthByte.toNat

end BytesValue

def voidCodec : SpecCodec Unit where
  measure _ := 0
  encode _ := []
  decode input := some { value := (), rest := input }

def boolCodec : SpecCodec Bool where
  measure _ := 1
  encode value := if value then [1] else [0]
  decode
    | b :: rest => some { value := if b = 0 then false else true, rest := rest }
    | [] => none

def u8Codec : SpecCodec Byte where
  measure _ := 1
  encode value := [value]
  decode
    | b :: rest => some { value := b, rest := rest }
    | [] => none

def u16Codec : SpecCodec U16LE where
  measure _ := 2
  encode value := [value.b0, value.b1]
  decode
    | b0 :: b1 :: rest => some { value := { b0 := b0, b1 := b1 }, rest := rest }
    | _ => none

def u32Codec : SpecCodec U32LE where
  measure _ := 4
  encode value := [value.b0, value.b1, value.b2, value.b3]
  decode
    | b0 :: b1 :: b2 :: b3 :: rest =>
        some { value := { b0 := b0, b1 := b1, b2 := b2, b3 := b3 }, rest := rest }
    | _ => none

def i32Codec : SpecCodec I32LE where
  measure _ := 4
  encode value := [value.b0, value.b1, value.b2, value.b3]
  decode
    | b0 :: b1 :: b2 :: b3 :: rest =>
        some { value := { b0 := b0, b1 := b1, b2 := b2, b3 := b3 }, rest := rest }
    | _ => none

def bytesCodec : SpecCodec BytesValue where
  measure value := 4 + value.data.length
  encode value := encodeSmallLengthPrefix value.lengthByte ++ value.data
  decode input :=
    match decodeSmallLengthPrefix input with
    | none => none
    | some lengthPrefix =>
        if lengthPrefix.value.toNat <= lengthPrefix.rest.length then
          some {
            value := { lengthByte := lengthPrefix.value, data := lengthPrefix.rest.take lengthPrefix.value.toNat },
            rest := lengthPrefix.rest.drop lengthPrefix.value.toNat
          }
        else
          none
  valid := BytesValue.Valid

theorem void_lawful : voidCodec.Lawful where
  encode_length_eq_measure value hValid := by
    cases value
    rfl
  decode_encode value suffix hValid := by
    cases value
    rfl

theorem bool_lawful : boolCodec.Lawful where
  encode_length_eq_measure value hValid := by
    cases value <;> rfl
  decode_encode value suffix hValid := by
    cases value <;> simp [boolCodec]

theorem u8_lawful : u8Codec.Lawful where
  encode_length_eq_measure value hValid := by
    rfl
  decode_encode value suffix hValid := by
    simp [u8Codec]

theorem u16_lawful : u16Codec.Lawful where
  encode_length_eq_measure value hValid := by
    cases value
    rfl
  decode_encode value suffix hValid := by
    cases value
    rfl

theorem u32_lawful : u32Codec.Lawful where
  encode_length_eq_measure value hValid := by
    cases value
    rfl
  decode_encode value suffix hValid := by
    cases value
    rfl

theorem i32_lawful : i32Codec.Lawful where
  encode_length_eq_measure value hValid := by
    cases value
    rfl
  decode_encode value suffix hValid := by
    cases value
    rfl

theorem bytes_encode_length_eq_measure (value : BytesValue) (_hValid : bytesCodec.valid value) :
    (bytesCodec.encode value).length = bytesCodec.measure value := by
  simp [bytesCodec, encodeSmallLengthPrefix_length]

theorem bytes_decode_encode (value : BytesValue) (suffix : List Byte)
    (hValid : bytesCodec.valid value) :
    bytesCodec.decode (bytesCodec.encode value ++ suffix) = some { value := value, rest := suffix } := by
  cases value with
  | mk lengthByte data =>
      simp [bytesCodec, BytesValue.Valid] at hValid ⊢
      simp [decodeSmallLengthPrefix_encode]
      rw [← hValid]
      simp

theorem bytes_lawful : bytesCodec.Lawful where
  encode_length_eq_measure := bytes_encode_length_eq_measure
  decode_encode := bytes_decode_encode

end Builtins
end Codec
end Shirika
