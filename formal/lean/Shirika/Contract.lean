import Std
import Shirika.Generated.Constants
import Shirika.UInt32


set_option autoImplicit false
set_option maxHeartbeats 2000000
set_option maxRecDepth 10000

namespace Shirika
namespace Contract

def maxMethodId : Nat := Shirika.Generated.Constants.maxMethodId

def validMethodId (id : Nat) : Prop :=
  1 <= id ∧ id <= maxMethodId

def validCodeUnit (codeUnit : Nat) : Prop :=
  codeUnit < 65536

structure JsonText where
  text : String
  codeUnits : List Nat
  deriving DecidableEq, Repr

structure MethodDef where
  method : JsonText
  methodSortKey : Nat
  id : Nat
  idCodeUnits : List Nat
  requestSig : JsonText
  responseSig : JsonText
  deriving DecidableEq, Repr

structure DescriptionEntry where
  method : String
  id : Nat
  request : String
  response : String
  deriving DecidableEq, Repr

namespace MethodDef

def Valid (method : MethodDef) : Prop :=
  validMethodId method.id

end MethodDef

def containsMethodId (id : Nat) : List MethodDef → Bool
  | [] => false
  | method :: methods => method.id == id || containsMethodId id methods

def uniqueMethodIds : List MethodDef → Prop
  | [] => True
  | method :: methods => containsMethodId method.id methods = false ∧ uniqueMethodIds methods

def allMethodIdsValid : List MethodDef → Prop
  | [] => True
  | method :: methods => MethodDef.Valid method ∧ allMethodIdsValid methods

def ValidContract (methods : List MethodDef) : Prop :=
  allMethodIdsValid methods ∧ uniqueMethodIds methods

def methodBeforeOrEq (left right : MethodDef) : Bool :=
  if left.id < right.id then
    true
  else if right.id < left.id then
    false
  else if left.methodSortKey <= right.methodSortKey then
    true
  else
    false

def insertMethod (method : MethodDef) : List MethodDef → List MethodDef
  | [] => [method]
  | head :: tail =>
      if methodBeforeOrEq method head then
        method :: head :: tail
      else
        head :: insertMethod method tail

def canonicalSort : List MethodDef → List MethodDef
  | [] => []
  | method :: methods => insertMethod method (canonicalSort methods)

def describeMethod (method : MethodDef) : DescriptionEntry :=
  {
    method := method.method.text,
    id := method.id,
    request := method.requestSig.text,
    response := method.responseSig.text
  }

def canonicalDescription (methods : List MethodDef) : List DescriptionEntry :=
  (canonicalSort methods).map describeMethod

def jsonMethodPrefix : List Nat := [123, 34, 109, 101, 116, 104, 111, 100, 34, 58, 34]

def jsonIdSeparator : List Nat := [34, 44, 34, 105, 100, 34, 58]

def jsonRequestSeparator : List Nat := [44, 34, 114, 101, 113, 117, 101, 115, 116, 34, 58, 34]

def jsonResponseSeparator : List Nat := [34, 44, 34, 114, 101, 115, 112, 111, 110, 115, 101, 34, 58, 34]

def jsonEntrySuffix : List Nat := [34, 125]

def jsonEntryCodeUnits (method : MethodDef) : List Nat :=
  jsonMethodPrefix ++ method.method.codeUnits ++ jsonIdSeparator ++ method.idCodeUnits ++
    jsonRequestSeparator ++ method.requestSig.codeUnits ++ jsonResponseSeparator ++
    method.responseSig.codeUnits ++ jsonEntrySuffix

def joinJsonEntries : List (List Nat) → List Nat
  | [] => []
  | entry :: [] => entry
  | entry :: entries => entry ++ [44] ++ joinJsonEntries entries

def jsonArrayCodeUnits (entries : List (List Nat)) : List Nat :=
  [91] ++ joinJsonEntries entries ++ [93]

def canonicalJsonCodeUnits (methods : List MethodDef) : List Nat :=
  jsonArrayCodeUnits ((canonicalSort methods).map jsonEntryCodeUnits)

def fnvOffsetBasis : Nat := 2166136261

def fnvPrime : Nat := 16777619

def xorLowerBits : Nat → Nat → Nat → Nat
  | 0, _, _ => 0
  | fuel + 1, left, right =>
      ((left % 2 + right % 2) % 2) + 2 * xorLowerBits fuel (left / 2) (right / 2)

def xor32 (left right : Nat) : Nat :=
  xorLowerBits 32 (UInt32.normalize left) (UInt32.normalize right)

def fnv1aStep (hash codeUnit : Nat) : Nat :=
  UInt32.normalize (xor32 hash codeUnit * fnvPrime)

def fnv1aFoldFrom (hash : Nat) : List Nat → Nat
  | [] => hash
  | codeUnit :: codeUnits => fnv1aFoldFrom (fnv1aStep hash codeUnit) codeUnits

def fnv1a32 (codeUnits : List Nat) : Nat :=
  fnv1aFoldFrom fnvOffsetBasis codeUnits

def lowerHexDigit (n : Nat) : Char :=
  match n % 16 with
  | 0 => '0'
  | 1 => '1'
  | 2 => '2'
  | 3 => '3'
  | 4 => '4'
  | 5 => '5'
  | 6 => '6'
  | 7 => '7'
  | 8 => '8'
  | 9 => '9'
  | 10 => 'a'
  | 11 => 'b'
  | 12 => 'c'
  | 13 => 'd'
  | 14 => 'e'
  | _ => 'f'

def hex8Chars (hash : Nat) : List Char :=
  [ lowerHexDigit (hash / 268435456),
    lowerHexDigit (hash / 16777216),
    lowerHexDigit (hash / 1048576),
    lowerHexDigit (hash / 65536),
    lowerHexDigit (hash / 4096),
    lowerHexDigit (hash / 256),
    lowerHexDigit (hash / 16),
    lowerHexDigit hash ]

def formatHash (hash : Nat) : String :=
  "fnv1a32:" ++ String.ofList (hex8Chars hash)

def hashString (codeUnits : List Nat) : String :=
  formatHash (fnv1a32 codeUnits)

theorem canonicalSort_two_swap_of_strict_order {left right : MethodDef}
    (hLeftRight : methodBeforeOrEq left right = true)
    (hRightLeft : methodBeforeOrEq right left = false) :
    canonicalSort [right, left] = canonicalSort [left, right] := by
  simp [canonicalSort, insertMethod, hLeftRight, hRightLeft]

theorem canonicalDescription_two_swap_of_strict_order {left right : MethodDef}
    (hLeftRight : methodBeforeOrEq left right = true)
    (hRightLeft : methodBeforeOrEq right left = false) :
    canonicalDescription [right, left] = canonicalDescription [left, right] := by
  unfold canonicalDescription
  rw [canonicalSort_two_swap_of_strict_order hLeftRight hRightLeft]


theorem canonicalJsonCodeUnits_two_swap_of_strict_order {left right : MethodDef}
    (hLeftRight : methodBeforeOrEq left right = true)
    (hRightLeft : methodBeforeOrEq right left = false) :
    canonicalJsonCodeUnits [right, left] = canonicalJsonCodeUnits [left, right] := by
  unfold canonicalJsonCodeUnits
  rw [canonicalSort_two_swap_of_strict_order hLeftRight hRightLeft]

theorem duplicate_ids_invalid (left right : MethodDef) (hSame : left.id = right.id) :
    ¬ uniqueMethodIds [left, right] := by
  intro hUnique
  have hHead : containsMethodId left.id [right] = false := hUnique.1
  unfold containsMethodId at hHead
  rw [hSame] at hHead
  simp at hHead

theorem duplicate_ids_invalid_contract (left right : MethodDef) (hSame : left.id = right.id) :
    ¬ ValidContract [left, right] := by
  intro hContract
  exact (duplicate_ids_invalid left right hSame) hContract.2

theorem maxMethodId_valid : validMethodId maxMethodId := by
  unfold validMethodId maxMethodId Shirika.Generated.Constants.maxMethodId
  constructor <;> decide

theorem above_maxMethodId_invalid : ¬ validMethodId (maxMethodId + 1) := by
  unfold validMethodId maxMethodId Shirika.Generated.Constants.maxMethodId
  intro hValid
  omega

theorem fnv1aStep_lt_modulus (hash codeUnit : Nat) :
    fnv1aStep hash codeUnit < UInt32.modulus := by
  unfold fnv1aStep
  exact UInt32.normalize_lt_modulus _

theorem fnv1aFoldFrom_lt_modulus :
    ∀ (codeUnits : List Nat) (hash : Nat), hash < UInt32.modulus →
      fnv1aFoldFrom hash codeUnits < UInt32.modulus
    := by
  intro codeUnits
  induction codeUnits with
  | nil =>
      intro hash hHash
      simpa [fnv1aFoldFrom] using hHash
  | cons codeUnit codeUnits ih =>
      intro hash _hHash
      simpa [fnv1aFoldFrom] using ih (fnv1aStep hash codeUnit) (fnv1aStep_lt_modulus hash codeUnit)

theorem fnv1a32_lt_modulus (codeUnits : List Nat) :
    fnv1a32 codeUnits < UInt32.modulus := by
  unfold fnv1a32
  exact fnv1aFoldFrom_lt_modulus codeUnits fnvOffsetBasis (by
    unfold fnvOffsetBasis UInt32.modulus
    decide)

theorem fnv1aFoldFrom_append (prefixUnits suffix : List Nat) (hash : Nat) :
    fnv1aFoldFrom hash (prefixUnits ++ suffix) =
      fnv1aFoldFrom (fnv1aFoldFrom hash prefixUnits) suffix := by
  induction prefixUnits generalizing hash with
  | nil => rfl
  | cons codeUnit prefixUnits ih =>
      simp [fnv1aFoldFrom, ih]

theorem fnv1a32_append (prefixUnits suffix : List Nat) :
    fnv1a32 (prefixUnits ++ suffix) = fnv1aFoldFrom (fnv1a32 prefixUnits) suffix := by
  unfold fnv1a32
  exact fnv1aFoldFrom_append prefixUnits suffix fnvOffsetBasis

theorem hex8Chars_length (hash : Nat) : (hex8Chars hash).length = 8 :=
  rfl

theorem formatHash_zero : formatHash 0 = "fnv1a32:00000000" := by
  rfl

theorem formatHash_offsetBasis : formatHash fnvOffsetBasis = "fnv1a32:811c9dc5" := by
  rfl

namespace Examples

def textEcho : JsonText := { text := "echo", codeUnits := [101, 99, 104, 111] }
def textSum : JsonText := { text := "sum", codeUnits := [115, 117, 109] }
def textProcessNested : JsonText :=
  { text := "processNested", codeUnits := [112, 114, 111, 99, 101, 115, 115, 78, 101, 115, 116, 101, 100] }
def textMaxMethod : JsonText :=
  { text := "maxMethod", codeUnits := [109, 97, 120, 77, 101, 116, 104, 111, 100] }
def sigVoid : JsonText := { text := "void", codeUnits := [118, 111, 105, 100] }
def sigString : JsonText := { text := "string", codeUnits := [115, 116, 114, 105, 110, 103] }
def sigU32 : JsonText := { text := "u32", codeUnits := [117, 51, 50] }
def sigTupleU32U32 : JsonText :=
  { text := "tuple(u32,u32)", codeUnits := [116, 117, 112, 108, 101, 40, 117, 51, 50, 44, 117, 51, 50, 41] }
def sigTupleBoolU16 : JsonText :=
  { text := "tuple(bool,u16)", codeUnits := [116, 117, 112, 108, 101, 40, 98, 111, 111, 108, 44, 117, 49, 54, 41] }
def sigNestedRequest : JsonText :=
  { text := "struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8)))",
    codeUnits := [115, 116, 114, 117, 99, 116, 40, 116, 97, 103, 58, 117, 56, 44, 109, 97, 121, 98, 101, 80, 97, 121, 108, 111, 97, 100, 58, 111, 112, 116, 105, 111, 110, 97, 108, 40, 98, 121, 116, 101, 115, 41, 44, 112, 97, 105, 114, 115, 58, 97, 114, 114, 97, 121, 40, 116, 117, 112, 108, 101, 40, 98, 111, 111, 108, 44, 117, 56, 41, 41, 41] }

def echoMethod : MethodDef :=
  {
    method := textEcho,
    methodSortKey := 1,
    id := 1,
    idCodeUnits := [49],
    requestSig := sigString,
    responseSig := sigString
  }

def sumMethod : MethodDef :=
  {
    method := textSum,
    methodSortKey := 3,
    id := 2,
    idCodeUnits := [50],
    requestSig := sigTupleU32U32,
    responseSig := sigU32
  }

def processNestedMethod : MethodDef :=
  {
    method := textProcessNested,
    methodSortKey := 2,
    id := 7,
    idCodeUnits := [55],
    requestSig := sigNestedRequest,
    responseSig := sigTupleBoolU16
  }

def maxMethod : MethodDef :=
  {
    method := textMaxMethod,
    methodSortKey := 4,
    id := maxMethodId,
    idCodeUnits := [52, 50, 57, 52, 57, 54, 55, 50, 57, 53],
    requestSig := sigVoid,
    responseSig := sigVoid
  }

def duplicateEchoMethod : MethodDef :=
  {
    method := textSum,
    methodSortKey := 3,
    id := 1,
    idCodeUnits := [49],
    requestSig := sigString,
    responseSig := sigString
  }

def representativeOrderA : List MethodDef :=
  [processNestedMethod, echoMethod, sumMethod]

def representativeOrderB : List MethodDef :=
  [sumMethod, processNestedMethod, echoMethod]

theorem singleMethod_canonicalDescription :
    canonicalDescription [echoMethod] =
      [{ method := "echo", id := 1, request := "string", response := "string" }] := by
  rfl

theorem representative_canonicalDescription_order_independent :
    canonicalDescription representativeOrderA = canonicalDescription representativeOrderB := by
  rfl

theorem representative_jsonCodeUnits_order_independent :
    canonicalJsonCodeUnits representativeOrderA = canonicalJsonCodeUnits representativeOrderB := by
  rfl

theorem duplicateExample_invalid : ¬ ValidContract [echoMethod, duplicateEchoMethod] := by
  exact duplicate_ids_invalid_contract echoMethod duplicateEchoMethod rfl

theorem maxMethod_valid : MethodDef.Valid maxMethod := by
  unfold MethodDef.Valid
  exact maxMethodId_valid

theorem singleMethod_hash_golden :
    hashString (canonicalJsonCodeUnits [echoMethod]) = "fnv1a32:4f97c9cb" := by
  rfl

theorem representative_hash_golden_orderA :
    hashString (canonicalJsonCodeUnits representativeOrderA) = "fnv1a32:f4228de3" := by
  rfl

theorem representative_hash_golden_orderB :
    hashString (canonicalJsonCodeUnits representativeOrderB) = "fnv1a32:f4228de3" := by
  rfl

theorem boundary_hash_golden :
    hashString (canonicalJsonCodeUnits [maxMethod]) = "fnv1a32:ed306561" := by
  rfl

theorem nested_hash_golden :
    hashString (canonicalJsonCodeUnits [processNestedMethod]) = "fnv1a32:449ac58d" := by
  rfl

theorem representative_contract_example :
    ValidContract representativeOrderA ∧
      canonicalDescription representativeOrderA = canonicalDescription representativeOrderB ∧
      hashString (canonicalJsonCodeUnits representativeOrderA) = "fnv1a32:f4228de3" := by
  constructor
  · simp [
      representativeOrderA,
      ValidContract,
      allMethodIdsValid,
      uniqueMethodIds,
      MethodDef.Valid,
      processNestedMethod,
      echoMethod,
      sumMethod,
      validMethodId,
      maxMethodId,
      containsMethodId,
      Shirika.Generated.Constants.maxMethodId,
    ]
  · constructor
    · exact representative_canonicalDescription_order_independent
    · exact representative_hash_golden_orderA

end Examples

end Contract
end Shirika
