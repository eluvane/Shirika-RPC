import Std
import Shirika.UInt32


set_option autoImplicit false

namespace Shirika
namespace Ring

abbrev Byte := UInt8

def offset (seq capacityBytes : Nat) : Nat :=
  seq % capacityBytes

def firstSegmentLength (capacityBytes offsetBytes length : Nat) : Nat :=
  min length (capacityBytes - offsetBytes)

def secondSegmentLength (capacityBytes offsetBytes length : Nat) : Nat :=
  length - firstSegmentLength capacityBytes offsetBytes length

def firstSegment (capacityBytes offsetBytes : Nat) (bytes : List Byte) : List Byte :=
  bytes.take (firstSegmentLength capacityBytes offsetBytes bytes.length)

def secondSegment (capacityBytes offsetBytes : Nat) (bytes : List Byte) : List Byte :=
  bytes.drop (firstSegmentLength capacityBytes offsetBytes bytes.length)

def reassembledAfterWrappedRead (capacityBytes offsetBytes : Nat) (bytes : List Byte) : List Byte :=
  firstSegment capacityBytes offsetBytes bytes ++ secondSegment capacityBytes offsetBytes bytes

def firstZeroFillSegment (capacityBytes offsetBytes length : Nat) : List Byte :=
  List.replicate (firstSegmentLength capacityBytes offsetBytes length) 0

def secondZeroFillSegment (capacityBytes offsetBytes length : Nat) : List Byte :=
  List.replicate (secondSegmentLength capacityBytes offsetBytes length) 0

def zeroFillLogicalBytes (capacityBytes offsetBytes length : Nat) : List Byte :=
  firstZeroFillSegment capacityBytes offsetBytes length ++
    secondZeroFillSegment capacityBytes offsetBytes length

structure Snapshot where
  capacityBytes : Nat
  usedBytes : Nat
  used_le_capacity : usedBytes <= capacityBytes

theorem offset_lt_capacity {seq capacityBytes : Nat} (hCapacity : 0 < capacityBytes) :
    offset seq capacityBytes < capacityBytes := by
  unfold offset
  exact Nat.mod_lt seq hCapacity

theorem offset_add_capacity {seq capacityBytes : Nat} (_hCapacity : 0 < capacityBytes) :
    offset (seq + capacityBytes) capacityBytes = offset seq capacityBytes := by
  unfold offset
  rw [Nat.add_mod]
  simp [Nat.mod_self]

theorem firstSegmentLength_le_length (capacityBytes offsetBytes length : Nat) :
    firstSegmentLength capacityBytes offsetBytes length <= length := by
  unfold firstSegmentLength
  exact Nat.min_le_left length (capacityBytes - offsetBytes)

theorem firstSegmentLength_le_contiguousSpace (capacityBytes offsetBytes length : Nat) :
    firstSegmentLength capacityBytes offsetBytes length <= capacityBytes - offsetBytes := by
  unfold firstSegmentLength
  exact Nat.min_le_right length (capacityBytes - offsetBytes)

theorem split_lengths_sum (capacityBytes offsetBytes length : Nat) :
    firstSegmentLength capacityBytes offsetBytes length +
      secondSegmentLength capacityBytes offsetBytes length = length := by
  unfold secondSegmentLength
  exact Nat.add_sub_of_le (firstSegmentLength_le_length capacityBytes offsetBytes length)

theorem secondSegmentLength_eq_zero_of_contiguous {capacityBytes offsetBytes length : Nat}
    (hContiguous : length <= capacityBytes - offsetBytes) :
    secondSegmentLength capacityBytes offsetBytes length = 0 := by
  unfold secondSegmentLength firstSegmentLength
  rw [Nat.min_eq_left hContiguous]
  exact Nat.sub_self length

theorem split_segments_reconstruct (capacityBytes offsetBytes : Nat) (bytes : List Byte) :
    firstSegment capacityBytes offsetBytes bytes ++ secondSegment capacityBytes offsetBytes bytes = bytes := by
  unfold firstSegment secondSegment
  exact List.take_append_drop _ bytes

theorem split_segments_reconstruct_length (capacityBytes offsetBytes : Nat) (bytes : List Byte) :
    (firstSegment capacityBytes offsetBytes bytes ++ secondSegment capacityBytes offsetBytes bytes).length = bytes.length := by
  rw [split_segments_reconstruct]

theorem write_read_same (capacityBytes offsetBytes : Nat) (bytes : List Byte) :
    reassembledAfterWrappedRead capacityBytes offsetBytes bytes = bytes := by
  unfold reassembledAfterWrappedRead
  exact split_segments_reconstruct capacityBytes offsetBytes bytes

theorem split_no_wrap_of_contiguous {capacityBytes offsetBytes : Nat} (bytes : List Byte)
    (hContiguous : bytes.length <= capacityBytes - offsetBytes) :
    firstSegment capacityBytes offsetBytes bytes = bytes ∧
      secondSegment capacityBytes offsetBytes bytes = [] := by
  unfold firstSegment secondSegment firstSegmentLength
  rw [Nat.min_eq_left hContiguous]
  simp

theorem firstZeroFillSegment_length (capacityBytes offsetBytes length : Nat) :
    (firstZeroFillSegment capacityBytes offsetBytes length).length =
      firstSegmentLength capacityBytes offsetBytes length := by
  simp [firstZeroFillSegment]

theorem secondZeroFillSegment_length (capacityBytes offsetBytes length : Nat) :
    (secondZeroFillSegment capacityBytes offsetBytes length).length =
      secondSegmentLength capacityBytes offsetBytes length := by
  simp [secondZeroFillSegment]

theorem zeroFillLogicalBytes_length (capacityBytes offsetBytes length : Nat) :
    (zeroFillLogicalBytes capacityBytes offsetBytes length).length = length := by
  unfold zeroFillLogicalBytes
  simp [firstZeroFillSegment_length, secondZeroFillSegment_length, split_lengths_sum]

theorem snapshot_used_plus_free_eq_capacity (snapshot : Snapshot) :
    snapshot.usedBytes + UInt32.freeBytes snapshot.capacityBytes snapshot.usedBytes = snapshot.capacityBytes := by
  exact UInt32.used_plus_free_eq_capacity snapshot.used_le_capacity

end Ring
end Shirika
