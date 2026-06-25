import Shirika.Codec.Builtins


set_option autoImplicit false

namespace Shirika
namespace Codec
namespace Combinators

open Builtins

def allValid {α : Type} (codec : SpecCodec α) : List α → Prop
  | [] => True
  | value :: values => codec.valid value ∧ allValid codec values

def encodeAll {α : Type} (codec : SpecCodec α) : List α → List Byte
  | [] => []
  | value :: values => codec.encode value ++ encodeAll codec values

def measureAll {α : Type} (codec : SpecCodec α) : List α → Nat
  | [] => 0
  | value :: values => codec.measure value + measureAll codec values

def decodeMany {α : Type} (codec : SpecCodec α) : Nat → List Byte → Option (DecodeResult (List α))
  | 0, input => some { value := [], rest := input }
  | count + 1, input =>
      match codec.decode input with
      | none => none
      | some head =>
          match decodeMany codec count head.rest with
          | none => none
          | some tail => some { value := head.value :: tail.value, rest := tail.rest }

structure ArrayValue (α : Type) where
  lengthByte : Byte
  items : List α
  deriving Repr

namespace ArrayValue

def Valid {α : Type} (codec : SpecCodec α) (value : ArrayValue α) : Prop :=
  value.items.length = value.lengthByte.toNat ∧ allValid codec value.items

end ArrayValue

def optionalCodec {α : Type} (codec : SpecCodec α) : SpecCodec (Option α) where
  measure
    | none => 1
    | some value => 1 + codec.measure value
  encode
    | none => [0]
    | some value => [1] ++ codec.encode value
  decode
    | flag :: rest =>
        if flag = 0 then
          some { value := none, rest := rest }
        else
          match codec.decode rest with
          | none => none
          | some decoded => some { value := some decoded.value, rest := decoded.rest }
    | [] => none
  valid
    | none => True
    | some value => codec.valid value

def tupleCodec {α β : Type} (left : SpecCodec α) (right : SpecCodec β) : SpecCodec (α × β) where
  measure value := left.measure value.1 + right.measure value.2
  encode value := left.encode value.1 ++ right.encode value.2
  decode input :=
    match left.decode input with
    | none => none
    | some leftResult =>
        match right.decode leftResult.rest with
        | none => none
        | some rightResult => some { value := (leftResult.value, rightResult.value), rest := rightResult.rest }
  valid value := left.valid value.1 ∧ right.valid value.2

def arrayCodec {α : Type} (item : SpecCodec α) : SpecCodec (ArrayValue α) where
  measure value := 4 + measureAll item value.items
  encode value := encodeSmallLengthPrefix value.lengthByte ++ encodeAll item value.items
  decode input :=
    match decodeSmallLengthPrefix input with
    | none => none
    | some lengthPrefix =>
        match decodeMany item lengthPrefix.value.toNat lengthPrefix.rest with
        | none => none
        | some decoded =>
            some { value := { lengthByte := lengthPrefix.value, items := decoded.value }, rest := decoded.rest }
  valid := ArrayValue.Valid item

structure Struct3 (α β γ : Type) where
  first : α
  second : β
  third : γ
  deriving Repr

def struct3Codec {α β γ : Type}
    (first : SpecCodec α) (second : SpecCodec β) (third : SpecCodec γ) :
    SpecCodec (Struct3 α β γ) where
  measure value := first.measure value.first + second.measure value.second + third.measure value.third
  encode value := first.encode value.first ++ second.encode value.second ++ third.encode value.third
  decode input :=
    match first.decode input with
    | none => none
    | some firstResult =>
        match second.decode firstResult.rest with
        | none => none
        | some secondResult =>
            match third.decode secondResult.rest with
            | none => none
            | some thirdResult =>
                some {
                  value := {
                    first := firstResult.value,
                    second := secondResult.value,
                    third := thirdResult.value
                  },
                  rest := thirdResult.rest
                }
  valid value := first.valid value.first ∧ second.valid value.second ∧ third.valid value.third

theorem encodeAll_length_eq_measure {α : Type} {codec : SpecCodec α} (lawful : codec.Lawful) :
    ∀ values, allValid codec values → (encodeAll codec values).length = measureAll codec values
  | [], hValid => rfl
  | value :: values, hValid => by
      have hValue : codec.valid value := hValid.1
      have hValues : allValid codec values := hValid.2
      simp [encodeAll, measureAll, List.length_append,
        lawful.encode_length_eq_measure value hValue,
        encodeAll_length_eq_measure lawful values hValues]

theorem decodeMany_encode {α : Type} {codec : SpecCodec α} (lawful : codec.Lawful) :
    ∀ values suffix, allValid codec values →
      decodeMany codec values.length (encodeAll codec values ++ suffix) =
        some { value := values, rest := suffix }
  | [], suffix, hValid => by
      simp [decodeMany, encodeAll]
  | value :: values, suffix, hValid => by
      have hValue : codec.valid value := hValid.1
      have hValues : allValid codec values := hValid.2
      simp [decodeMany, encodeAll, List.append_assoc,
        lawful.decode_encode value (encodeAll codec values ++ suffix) hValue,
        decodeMany_encode lawful values suffix hValues]

theorem optional_lawful {α : Type} {codec : SpecCodec α} (lawful : codec.Lawful) :
    (optionalCodec codec).Lawful where
  encode_length_eq_measure
    | none, hValid => rfl
    | some value, hValid => by
        simp [optionalCodec, lawful.encode_length_eq_measure value hValid]
        omega
  decode_encode
    | none, suffix, hValid => by
        simp [optionalCodec]
    | some value, suffix, hValid => by
        simp [optionalCodec, lawful.decode_encode value suffix hValid]

theorem tuple_lawful {α β : Type} {left : SpecCodec α} {right : SpecCodec β}
    (leftLawful : left.Lawful) (rightLawful : right.Lawful) :
    (tupleCodec left right).Lawful where
  encode_length_eq_measure value hValid := by
    cases value with
    | mk leftValue rightValue =>
        simp [tupleCodec, List.length_append,
          leftLawful.encode_length_eq_measure leftValue hValid.1,
          rightLawful.encode_length_eq_measure rightValue hValid.2]
  decode_encode value suffix hValid := by
    cases value with
    | mk leftValue rightValue =>
        simp [tupleCodec, List.append_assoc,
          leftLawful.decode_encode leftValue (right.encode rightValue ++ suffix) hValid.1,
          rightLawful.decode_encode rightValue suffix hValid.2]

theorem array_lawful {α : Type} {item : SpecCodec α} (itemLawful : item.Lawful) :
    (arrayCodec item).Lawful where
  encode_length_eq_measure value hValid := by
    cases value with
    | mk lengthByte items =>
        simp [arrayCodec, ArrayValue.Valid] at hValid
        have hItems : allValid item items := hValid.2
        simp [arrayCodec, encodeSmallLengthPrefix_length,
          encodeAll_length_eq_measure itemLawful items hItems]
  decode_encode value suffix hValid := by
    cases value with
    | mk lengthByte items =>
        simp [arrayCodec, ArrayValue.Valid] at hValid
        have hLength : items.length = lengthByte.toNat := hValid.1
        have hItems : allValid item items := hValid.2
        have hDecode := decodeMany_encode itemLawful items suffix hItems
        rw [hLength] at hDecode
        simp [arrayCodec, decodeSmallLengthPrefix_encode, hDecode]

theorem struct3_lawful {α β γ : Type}
    {first : SpecCodec α} {second : SpecCodec β} {third : SpecCodec γ}
    (firstLawful : first.Lawful) (secondLawful : second.Lawful) (thirdLawful : third.Lawful) :
    (struct3Codec first second third).Lawful where
  encode_length_eq_measure value hValid := by
    cases value with
    | mk firstValue secondValue thirdValue =>
        simp [struct3Codec, List.length_append,
          firstLawful.encode_length_eq_measure firstValue hValid.1,
          secondLawful.encode_length_eq_measure secondValue hValid.2.1,
          thirdLawful.encode_length_eq_measure thirdValue hValid.2.2,
          Nat.add_assoc]
  decode_encode value suffix hValid := by
    cases value with
    | mk firstValue secondValue thirdValue =>
        simp [struct3Codec] at hValid
        simp [struct3Codec, List.append_assoc,
          firstLawful.decode_encode firstValue
            (second.encode secondValue ++ (third.encode thirdValue ++ suffix)) hValid.1,
          secondLawful.decode_encode secondValue (third.encode thirdValue ++ suffix) hValid.2.1,
          thirdLawful.decode_encode thirdValue suffix hValid.2.2]

end Combinators
end Codec
end Shirika
