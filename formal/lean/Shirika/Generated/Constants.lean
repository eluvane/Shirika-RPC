import Std

set_option autoImplicit false

namespace Shirika
namespace Generated
namespace Constants

def controlI32Count : Nat := 8

def defaultCapacityBytes : Nat := 1048576

def headerSize : Nat := 32

def minCapacityBytes : Nat := 32

def maxCapacityBytes : Nat := 1073741824

def frameMagic : Nat := 1398034481

def frameVersion : Nat := 1

def normalizeThreshold : Nat := 1073741824

def uint32Max : Nat := 4294967295

def maxMethodId : Nat := 4294967295

def frameMagicByte0 : UInt8 := 0x31
def frameMagicByte1 : UInt8 := 0x50
def frameMagicByte2 : UInt8 := 0x54
def frameMagicByte3 : UInt8 := 0x53
def frameVersionByte0 : UInt8 := 0x01
def frameVersionByte1 : UInt8 := 0x00

def controlIndexReadSeq : Nat := 0

def controlIndexWriteSeq : Nat := 1

def controlIndexDataSeq : Nat := 2

def controlIndexSpaceSeq : Nat := 3

def controlIndexState : Nat := 4

def controlIndexLastError : Nat := 5

def controlIndexReserved0 : Nat := 6

def controlIndexReserved1 : Nat := 7

def transportStateOpen : Nat := 0

def transportStateClosing : Nat := 1

def transportStateClosed : Nat := 2

def transportStateErrored : Nat := 3

def opcodeRequest : Nat := 1
def opcodeRequestByte0 : UInt8 := 0x01
def opcodeRequestByte1 : UInt8 := 0x00

def opcodeResponseOk : Nat := 2
def opcodeResponseOkByte0 : UInt8 := 0x02
def opcodeResponseOkByte1 : UInt8 := 0x00

def opcodeResponseErr : Nat := 3
def opcodeResponseErrByte0 : UInt8 := 0x03
def opcodeResponseErrByte1 : UInt8 := 0x00

def opcodeNotify : Nat := 4
def opcodeNotifyByte0 : UInt8 := 0x04
def opcodeNotifyByte1 : UInt8 := 0x00

def opcodeClose : Nat := 5
def opcodeCloseByte0 : UInt8 := 0x05
def opcodeCloseByte1 : UInt8 := 0x00

def opcodeCancel : Nat := 6
def opcodeCancelByte0 : UInt8 := 0x06
def opcodeCancelByte1 : UInt8 := 0x00

def frameFlagNone : Nat := 0

def frameFlagHasDeadline : Nat := 1

def cancelCodeClientAbort : Nat := 1

def cancelCodeTimeout : Nat := 2

def cancelCodeClientClose : Nat := 3

def transportErrorHintNone : Nat := 0

def transportErrorHintClosed : Nat := 1

def transportErrorHintProtocol : Nat := 2

def transportErrorHintOversize : Nat := 3

def transportErrorHintTimeout : Nat := 4

def transportErrorHintInternal : Nat := 5

end Constants
end Generated
end Shirika
