import Shirika.Codec.Combinators


set_option autoImplicit false

namespace Shirika
namespace Codec
namespace Examples

open Builtins
open Combinators

def optionalU8Codec : SpecCodec (Option Byte) :=
  optionalCodec u8Codec

def arrayU8Codec : SpecCodec (ArrayValue Byte) :=
  arrayCodec u8Codec

def tupleBoolU8Codec : SpecCodec (Bool × Byte) :=
  tupleCodec boolCodec u8Codec

def tupleBoolU16Codec : SpecCodec (Bool × U16LE) :=
  tupleCodec boolCodec u16Codec

def simpleStructCodec : SpecCodec (Struct3 Byte U16LE Bool) :=
  struct3Codec u8Codec u16Codec boolCodec

def representativeStructCodec : SpecCodec
    (Struct3 Byte (Option BytesValue) (ArrayValue (Bool × Byte))) :=
  struct3Codec u8Codec (optionalCodec bytesCodec) (arrayCodec (tupleCodec boolCodec u8Codec))

theorem optionalU8_lawful : optionalU8Codec.Lawful :=
  optional_lawful u8_lawful

theorem arrayU8_lawful : arrayU8Codec.Lawful :=
  array_lawful u8_lawful

theorem tupleBoolU8_lawful : tupleBoolU8Codec.Lawful :=
  tuple_lawful bool_lawful u8_lawful

theorem tupleBoolU16_lawful : tupleBoolU16Codec.Lawful :=
  tuple_lawful bool_lawful u16_lawful

theorem simpleStruct_lawful : simpleStructCodec.Lawful :=
  struct3_lawful u8_lawful u16_lawful bool_lawful

theorem representativeStruct_lawful : representativeStructCodec.Lawful :=
  struct3_lawful u8_lawful (optional_lawful bytes_lawful)
    (array_lawful (tuple_lawful bool_lawful u8_lawful))

theorem representativeStruct_encode_length_eq_measure
    (value : Struct3 Byte (Option BytesValue) (ArrayValue (Bool × Byte)))
    (hValid : representativeStructCodec.valid value) :
    (representativeStructCodec.encode value).length = representativeStructCodec.measure value :=
  SpecCodec.encode_length_eq_measure representativeStruct_lawful value hValid

theorem representativeStruct_decode_encode
    (value : Struct3 Byte (Option BytesValue) (ArrayValue (Bool × Byte)))
    (suffix : List Byte) (hValid : representativeStructCodec.valid value) :
    representativeStructCodec.decode (representativeStructCodec.encode value ++ suffix) =
      some { value := value, rest := suffix } :=
  SpecCodec.decode_encode representativeStruct_lawful value suffix hValid

end Examples
end Codec
end Shirika
