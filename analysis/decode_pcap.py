"""Decode Livox Mid-360(S) point-cloud + IMU UDP packets from a raw tcpdump .pcap.
Point packets: src port 56300, 36-byte header + 96 x (int32 x,y,z mm, uint8 reflectivity, uint8 tag).
IMU packets:   src port 56400, 36-byte header + 6 x float32 (gyro rad/s, accel g), 200 Hz.
Usage: python3 decode_pcap.py livox_pointcloud_imu_udp.pcap out.npz [keep_every_nth_packet]
"""
import sys, struct, numpy as np
pcap, out, keep = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5
f = open(pcap, 'rb', buffering=16*1024*1024); f.read(24)
H = struct.Struct('<IIII'); bufs = []; ts = []; imu = []; n = 0
while True:
    h = f.read(16)
    if len(h) < 16: break
    incl = H.unpack(h)[2]; d = f.read(incl)
    if len(d) < incl: break
    if d[12:14] != b'\x08\x00' or d[23] != 17: continue          # IPv4 / UDP only
    u = 14 + (d[14] & 15) * 4; sp = (d[u] << 8) | d[u+1]; p = d[u+8:]
    if sp == 56300 and len(p) == 1380:                              # point cloud
        n += 1
        if n % keep == 0: bufs.append(p[36:]); ts.append(struct.unpack_from('<Q', p, 28)[0])
    elif sp == 56400 and len(p) >= 60:                              # IMU
        imu.append((struct.unpack_from('<Q', p, 28)[0],) + struct.unpack_from('<6f', p, 36))
dt = np.dtype([('x','<i4'),('y','<i4'),('z','<i4'),('r','u1'),('tag','u1')])
a = np.frombuffer(b''.join(bufs), dtype=dt)
xyz = np.clip(np.stack([a['x'], a['y'], a['z']], 1) // 10, -32000, 32000).astype(np.int16)  # cm
np.savez_compressed(out, xyz_cm=xyz, r=a['r'], pkt_t=np.array(ts, np.uint64), imu=np.array(imu))
print(out, len(a), 'points,', len(imu), 'IMU samples')
