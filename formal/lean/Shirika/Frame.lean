import Std
import Shirika.Align
import Shirika.Generated.Constants


set_option autoImplicit false

namespace Shirika
namespace Frame

abbrev Byte := UInt8

structure U16LE where
  b0 : Byte
  b1 : Byte
  deriving DecidableEq, Repr

structure U32LE where
  b0 : Byte
  b1 : Byte
  b2 : Byte
  b3 : Byte
  deriving DecidableEq, Repr

namespace U16LE

def toNat (x : U16LE) : Nat :=
  x.b0.toNat + 256 * x.b1.toNat

end U16LE

namespace U32LE

def toNat (x : U32LE) : Nat :=
  x.b0.toNat + 256 * x.b1.toNat + 65536 * x.b2.toNat + 16777216 * x.b3.toNat

end U32LE

def frameMagic : U32LE :=
  { b0 := Shirika.Generated.Constants.frameMagicByte0,
    b1 := Shirika.Generated.Constants.frameMagicByte1,
    b2 := Shirika.Generated.Constants.frameMagicByte2,
    b3 := Shirika.Generated.Constants.frameMagicByte3 }

def frameVersion : U16LE :=
  { b0 := Shirika.Generated.Constants.frameVersionByte0,
    b1 := Shirika.Generated.Constants.frameVersionByte1 }

def opcodeRequest : U16LE := { b0 := Shirika.Generated.Constants.opcodeRequestByte0, b1 := Shirika.Generated.Constants.opcodeRequestByte1 }
def opcodeResponseOk : U16LE := { b0 := Shirika.Generated.Constants.opcodeResponseOkByte0, b1 := Shirika.Generated.Constants.opcodeResponseOkByte1 }
def opcodeResponseErr : U16LE := { b0 := Shirika.Generated.Constants.opcodeResponseErrByte0, b1 := Shirika.Generated.Constants.opcodeResponseErrByte1 }
def opcodeNotify : U16LE := { b0 := Shirika.Generated.Constants.opcodeNotifyByte0, b1 := Shirika.Generated.Constants.opcodeNotifyByte1 }
def opcodeClose : U16LE := { b0 := Shirika.Generated.Constants.opcodeCloseByte0, b1 := Shirika.Generated.Constants.opcodeCloseByte1 }
def opcodeCancel : U16LE := { b0 := Shirika.Generated.Constants.opcodeCancelByte0, b1 := Shirika.Generated.Constants.opcodeCancelByte1 }

def isOpcode (opcode : U16LE) : Bool :=
  opcode == opcodeRequest || opcode == opcodeResponseOk || opcode == opcodeResponseErr ||
    opcode == opcodeNotify || opcode == opcodeClose || opcode == opcodeCancel

structure FrameHeader where
  magic : U32LE
  version : U16LE
  opcode : U16LE
  flags : U32LE
  requestId : U32LE
  methodId : U32LE
  statusCode : U32LE
  payloadLength : U32LE
  reserved : U32LE
  deriving DecidableEq, Repr

def encodeHeader (h : FrameHeader) : List Byte :=
  [ h.magic.b0, h.magic.b1, h.magic.b2, h.magic.b3,
    h.version.b0, h.version.b1,
    h.opcode.b0, h.opcode.b1,
    h.flags.b0, h.flags.b1, h.flags.b2, h.flags.b3,
    h.requestId.b0, h.requestId.b1, h.requestId.b2, h.requestId.b3,
    h.methodId.b0, h.methodId.b1, h.methodId.b2, h.methodId.b3,
    h.statusCode.b0, h.statusCode.b1, h.statusCode.b2, h.statusCode.b3,
    h.payloadLength.b0, h.payloadLength.b1, h.payloadLength.b2, h.payloadLength.b3,
    h.reserved.b0, h.reserved.b1, h.reserved.b2, h.reserved.b3 ]

def decodeHeader : List Byte -> Option FrameHeader
  | [ m0, m1, m2, m3,
      v0, v1,
      op0, op1,
      fl0, fl1, fl2, fl3,
      rq0, rq1, rq2, rq3,
      md0, md1, md2, md3,
      st0, st1, st2, st3,
      pl0, pl1, pl2, pl3,
      rs0, rs1, rs2, rs3 ] =>
      some {
        magic := { b0 := m0, b1 := m1, b2 := m2, b3 := m3 },
        version := { b0 := v0, b1 := v1 },
        opcode := { b0 := op0, b1 := op1 },
        flags := { b0 := fl0, b1 := fl1, b2 := fl2, b3 := fl3 },
        requestId := { b0 := rq0, b1 := rq1, b2 := rq2, b3 := rq3 },
        methodId := { b0 := md0, b1 := md1, b2 := md2, b3 := md3 },
        statusCode := { b0 := st0, b1 := st1, b2 := st2, b3 := st3 },
        payloadLength := { b0 := pl0, b1 := pl1, b2 := pl2, b3 := pl3 },
        reserved := { b0 := rs0, b1 := rs1, b2 := rs2, b3 := rs3 }
      }
  | _ => none

theorem encodeHeader_length (h : FrameHeader) : (encodeHeader h).length = Align.headerSize := by
  rfl

theorem decode_encode_header (h : FrameHeader) : decodeHeader (encodeHeader h) = some h := by
  cases h with
  | mk magic version opcode flags requestId methodId statusCode payloadLength reserved =>
      cases magic
      cases version
      cases opcode
      cases flags
      cases requestId
      cases methodId
      cases statusCode
      cases payloadLength
      cases reserved
      rfl

def ValidHeader (h : FrameHeader) (capacityBytes frameSize : Nat) : Prop :=
  h.magic = frameMagic ∧
    h.version = frameVersion ∧
    isOpcode h.opcode = true ∧
    frameSize = Align.frameSize h.payloadLength.toNat ∧
    frameSize <= capacityBytes

instance (h : FrameHeader) (capacityBytes frameSize : Nat) :
    Decidable (ValidHeader h capacityBytes frameSize) := by
  unfold ValidHeader
  infer_instance

def validateHeader (h : FrameHeader) (capacityBytes : Nat) : Option Nat :=
  let frameSize := Align.frameSize h.payloadLength.toNat
  if ValidHeader h capacityBytes frameSize then
    some frameSize
  else
    none

theorem validateHeader_success {h : FrameHeader} {capacityBytes frameSize : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) :
    ValidHeader h capacityBytes frameSize := by
  unfold validateHeader at hOk
  by_cases hValid : ValidHeader h capacityBytes (Align.frameSize h.payloadLength.toNat)
  · simp [hValid] at hOk
    cases hOk
    exact hValid
  · simp [hValid] at hOk

theorem validateHeader_success_implies_known_opcode {h : FrameHeader} {capacityBytes frameSize : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) :
    isOpcode h.opcode = true := by
  exact (validateHeader_success hOk).2.2.1

theorem validateHeader_success_implies_frameSize_le_capacity {h : FrameHeader}
    {capacityBytes frameSize : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    frameSize <= capacityBytes := by
  exact (validateHeader_success hOk).2.2.2.2


theorem validateHeader_success_implies_magic {h : FrameHeader} {capacityBytes frameSize : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) :
    h.magic = frameMagic := by
  exact (validateHeader_success hOk).1

theorem validateHeader_success_implies_version {h : FrameHeader} {capacityBytes frameSize : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) :
    h.version = frameVersion := by
  exact (validateHeader_success hOk).2.1

theorem validateHeader_success_implies_frameSize_eq_align {h : FrameHeader}
    {capacityBytes frameSize : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    frameSize = Align.frameSize h.payloadLength.toNat := by
  exact (validateHeader_success hOk).2.2.2.1

theorem validateHeader_success_implies_header_le_frameSize {h : FrameHeader}
    {capacityBytes frameSize : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    Align.headerSize <= frameSize := by
  have hFrameSize := validateHeader_success_implies_frameSize_eq_align hOk
  have hPayload : Align.headerSize + h.payloadLength.toNat <= Align.frameSize h.payloadLength.toNat :=
    Align.frameSize_ge_header_payload h.payloadLength.toNat
  rw [← hFrameSize] at hPayload
  omega

theorem validateHeader_success_implies_header_payload_le_capacity {h : FrameHeader}
    {capacityBytes frameSize : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    Align.headerSize + h.payloadLength.toNat <= capacityBytes := by
  have hFrameSize := validateHeader_success_implies_frameSize_eq_align hOk
  have hPayload : Align.headerSize + h.payloadLength.toNat <= Align.frameSize h.payloadLength.toNat :=
    Align.frameSize_ge_header_payload h.payloadLength.toNat
  have hCapacity : frameSize <= capacityBytes :=
    validateHeader_success_implies_frameSize_le_capacity hOk
  rw [← hFrameSize] at hPayload
  exact Nat.le_trans hPayload hCapacity

def payloadSeq (readSeq : Nat) : Nat :=
  readSeq + Align.headerSize

def paddingSeq (readSeq payloadLength : Nat) : Nat :=
  payloadSeq readSeq + payloadLength

def frameEndSeq (readSeq frameSize : Nat) : Nat :=
  readSeq + frameSize

theorem validateHeader_success_implies_payload_end_le_frame_end {h : FrameHeader}
    {capacityBytes frameSize readSeq : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    paddingSeq readSeq h.payloadLength.toNat <= frameEndSeq readSeq frameSize := by
  unfold paddingSeq payloadSeq frameEndSeq
  have hFrameSize := validateHeader_success_implies_frameSize_eq_align hOk
  have hPayload : Align.headerSize + h.payloadLength.toNat <= Align.frameSize h.payloadLength.toNat :=
    Align.frameSize_ge_header_payload h.payloadLength.toNat
  rw [← hFrameSize] at hPayload
  omega

theorem validateHeader_success_and_readable_implies_payload_range_readable {h : FrameHeader}
    {capacityBytes frameSize readSeq readableBytes : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) (hReadable : frameSize <= readableBytes) :
    paddingSeq readSeq h.payloadLength.toNat <= readSeq + readableBytes := by
  have hPayloadEnd := validateHeader_success_implies_payload_end_le_frame_end
    (h := h) (capacityBytes := capacityBytes) (frameSize := frameSize) (readSeq := readSeq) hOk
  unfold frameEndSeq at hPayloadEnd
  omega

theorem validateHeader_success_implies_padding_end_eq_frame_end {h : FrameHeader}
    {capacityBytes frameSize readSeq : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    paddingSeq readSeq h.payloadLength.toNat +
        (frameSize - Align.headerSize - h.payloadLength.toNat) = frameEndSeq readSeq frameSize := by
  unfold paddingSeq payloadSeq frameEndSeq
  have hFrameSize := validateHeader_success_implies_frameSize_eq_align hOk
  have hPayload : Align.headerSize + h.payloadLength.toNat <= Align.frameSize h.payloadLength.toNat :=
    Align.frameSize_ge_header_payload h.payloadLength.toNat
  rw [← hFrameSize] at hPayload
  omega

theorem validateHeader_success_implies_trailing_padding_lt_8 {h : FrameHeader}
    {capacityBytes frameSize : Nat} (hOk : validateHeader h capacityBytes = some frameSize) :
    frameSize - Align.headerSize - h.payloadLength.toNat < 8 := by
  have hFrameSize := validateHeader_success_implies_frameSize_eq_align hOk
  have hDecompose := Align.frameSize_eq_header_payload_add_padding h.payloadLength.toNat
  have hPadding := Align.framePadding_lt_8 h.payloadLength.toNat
  rw [hFrameSize, hDecompose]
  omega


def alignedBytesPrefixLength : Nat := 8

def alignedBytesPayloadLength (byteLength : Nat) : Nat :=
  byteLength + alignedBytesPrefixLength

def alignedBytesBytesSeq (payloadStart : Nat) : Nat :=
  payloadStart + alignedBytesPrefixLength

def alignedBytesEndSeq (payloadStart byteLength : Nat) : Nat :=
  alignedBytesBytesSeq payloadStart + byteLength

theorem alignedBytes_prefix_range_inside_payload {payloadStart payloadLength byteLength : Nat}
    (hRelation : payloadLength = alignedBytesPayloadLength byteLength) :
    payloadStart + alignedBytesPrefixLength <= payloadStart + payloadLength := by
  unfold alignedBytesPayloadLength alignedBytesPrefixLength at hRelation
  unfold alignedBytesPrefixLength
  omega

theorem alignedBytes_byteLength_le_payloadLength {payloadLength byteLength : Nat}
    (hRelation : payloadLength = alignedBytesPayloadLength byteLength) :
    byteLength <= payloadLength := by
  unfold alignedBytesPayloadLength alignedBytesPrefixLength at hRelation
  omega

theorem alignedBytes_bytesSeq_eq_payloadStart_add_prefixLength (payloadStart : Nat) :
    alignedBytesBytesSeq payloadStart = payloadStart + alignedBytesPrefixLength := by
  rfl

theorem alignedBytes_bytes_range_end_eq_payload_end {payloadStart payloadLength byteLength : Nat}
    (hRelation : payloadLength = alignedBytesPayloadLength byteLength) :
    alignedBytesEndSeq payloadStart byteLength = payloadStart + payloadLength := by
  unfold alignedBytesPayloadLength alignedBytesPrefixLength at hRelation
  unfold alignedBytesEndSeq alignedBytesBytesSeq alignedBytesPrefixLength
  omega

theorem alignedBytes_bytes_range_inside_payload {payloadStart payloadLength byteLength : Nat}
    (hRelation : payloadLength = alignedBytesPayloadLength byteLength) :
    alignedBytesEndSeq payloadStart byteLength <= payloadStart + payloadLength := by
  unfold alignedBytesPayloadLength alignedBytesPrefixLength at hRelation
  unfold alignedBytesEndSeq alignedBytesBytesSeq alignedBytesPrefixLength
  omega

theorem validateHeader_success_and_alignedBytes_implies_prefix_range_readable {h : FrameHeader}
    {capacityBytes frameSize readSeq readableBytes byteLength : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) (hReadable : frameSize <= readableBytes)
    (hRelation : h.payloadLength.toNat = alignedBytesPayloadLength byteLength) :
    payloadSeq readSeq + alignedBytesPrefixLength <= readSeq + readableBytes := by
  have hPrefixInside := alignedBytes_prefix_range_inside_payload
    (payloadStart := payloadSeq readSeq) (payloadLength := h.payloadLength.toNat)
    (byteLength := byteLength) hRelation
  have hPayloadReadable := validateHeader_success_and_readable_implies_payload_range_readable
    (h := h) (capacityBytes := capacityBytes) (frameSize := frameSize) (readSeq := readSeq)
    (readableBytes := readableBytes) hOk hReadable
  exact Nat.le_trans hPrefixInside hPayloadReadable

theorem validateHeader_success_and_alignedBytes_implies_bytes_range_readable {h : FrameHeader}
    {capacityBytes frameSize readSeq readableBytes byteLength : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) (hReadable : frameSize <= readableBytes)
    (hRelation : h.payloadLength.toNat = alignedBytesPayloadLength byteLength) :
    alignedBytesEndSeq (payloadSeq readSeq) byteLength <= readSeq + readableBytes := by
  have hBytesEnd := alignedBytes_bytes_range_end_eq_payload_end
    (payloadStart := payloadSeq readSeq) (payloadLength := h.payloadLength.toNat)
    (byteLength := byteLength) hRelation
  have hPayloadReadable := validateHeader_success_and_readable_implies_payload_range_readable
    (h := h) (capacityBytes := capacityBytes) (frameSize := frameSize) (readSeq := readSeq)
    (readableBytes := readableBytes) hOk hReadable
  rw [hBytesEnd]
  exact hPayloadReadable

theorem validateHeader_success_implies_aligned {h : FrameHeader} {capacityBytes frameSize : Nat}
    (hOk : validateHeader h capacityBytes = some frameSize) :
    frameSize % 8 = 0 := by
  have hValid := validateHeader_success hOk
  rw [hValid.2.2.2.1]
  exact Align.frameSize_mod8 h.payloadLength.toNat

end Frame
end Shirika
