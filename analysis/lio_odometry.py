"""Lightweight LiDAR-inertial odometry for Livox Mid-360 handheld recordings.
- gyro integration -> per-point rotational deskew + rotation prior
- constant-velocity translation prior
- robust (Geman-McClure) point-to-point ICP against a voxel local map (KISS-ICP style)
Usage: python3 lio.py in.npz out_prefix
"""
import sys, numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as Rot

def skew(v):
    return np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]])

def run(path, out, frame_dt=0.1, vox=0.5, map_vox=0.5, max_range=40.0, min_range=0.6):
    z = np.load(path)
    xyz = z['xyz_cm'].astype(np.float32) / 100.0
    refl = z['r']
    pt = z['pkt_t'].astype(np.float64) / 1e9
    imu = z['imu']
    t0 = pt[0]
    pt -= t0
    ti = imu[:, 0] / 1e9 - t0
    gyr = imu[:, 1:4]; acc = imu[:, 4:7]
    ppk = len(xyz) // len(pt)
    tp = np.repeat(pt, ppk)
    # IMU-integrated orientation (body->imu-world), start at gravity-aligned
    g0 = acc[: 200].mean(0); g0 /= np.linalg.norm(g0)
    # rotation that maps g0 to +z
    R0 = Rot.align_vectors([[0, 0, 1]], [g0])[0]
    qs = [R0]
    for k in range(1, len(ti)):
        dt = ti[k] - ti[k - 1]
        w = 0.5 * (gyr[k] + gyr[k - 1])
        qs.append(qs[-1] * Rot.from_rotvec(w * dt))
    Rimu = Rot.concatenate(qs)
    quat = Rimu.as_quat()
    def R_at(t):
        idx = np.clip(np.searchsorted(ti, t), 1, len(ti) - 1)
        # nearest (200 Hz is dense enough)
        return Rot.from_quat(quat[idx])

    rng = np.linalg.norm(xyz, axis=1)
    good = (rng > min_range) & (rng < max_range)
    nF = int(pt[-1] / frame_dt)
    fidx = (tp / frame_dt).astype(np.int64)

    MV=0.25
    def hkey(P):
        k=np.floor(P/MV).astype(np.int64)
        return (k[:,0]*1000003+k[:,1])*1000003+k[:,2]
    state={'P':np.zeros((0,3),np.float32),'K':np.zeros(0,np.int64)}
    def add_map(P):
        k=hkey(P); k,u=np.unique(k,return_index=True); P=P[u]
        new=~np.isin(k,state['K'],assume_unique=False)
        state['P']=np.vstack([state['P'],P[new]]); state['K']=np.concatenate([state['K'],k[new]])
    def vox_down(P, s):
        k = np.floor(P / s).astype(np.int64)
        _, u = np.unique(k, axis=0, return_index=True)
        return P[u]

    poses = []  # (t, R(3x3), t(3))
    T_R = R0.as_matrix(); T_t = np.zeros(3)
    prev_R, prev_t = T_R.copy(), T_t.copy()
    sigma = 1.0
    world_chunks = []; refl_chunks = []
    order = np.argsort(fidx, kind='stable')
    bounds = np.searchsorted(fidx[order], np.arange(nF + 1))
    tree = None; map_arr = None
    for f in range(nF):
        sel = order[bounds[f]:bounds[f + 1]]
        sel = sel[good[sel]]
        if len(sel) < 200:
            continue
        if False:
            continue
        tf = f * frame_dt
        P = xyz[sel]; T = tp[sel]
        # deskew to frame start using IMU rotation
        Rf = R_at(np.array([tf]))
        Rrel = (Rf.inv() * R_at(T)).as_matrix() if False else None
        Rf_inv = Rf.inv()
        Rpts = Rf_inv * R_at(T)
        P = Rpts.apply(P)
        # prediction
        if poses:
            dR_imu = (R_at(np.array([tf])) * R_at(np.array([poses[-1][0]])).inv()).as_matrix()[0]
            # world-frame rotation increment from IMU (in imu-world) -> apply to our estimate
            # our world == imu-world corrected; use body-frame increment
            Rb_prev = R_at(np.array([poses[-1][0]])).as_matrix()[0]
            Rb_cur = R_at(np.array([tf])).as_matrix()[0]
            dRb = Rb_prev.T @ Rb_cur
            pred_R = T_R @ dRb
            vel = (T_t - prev_t) if len(poses) > 1 else np.zeros(3)
            pred_t = T_t + vel
        else:
            pred_R, pred_t = T_R, T_t
        src = vox_down(P, vox)
        R, t = pred_R.copy(), pred_t.copy()
        if map_arr is not None:
            for it in range(20):
                W = src @ R.T + t
                d, j = tree.query(W, distance_upper_bound=3 * sigma)
                m = np.isfinite(d)
                if m.sum() < 50: break
                a = W[m]; b = map_arr[j[m]]
                r = a - b
                # GM weights
                k2 = (sigma / 3) ** 2
                e2 = (r * r).sum(1)
                w = k2 / (k2 + e2) ** 2 * k2
                J = np.zeros((len(a), 3, 6))
                J[:, :, :3] = np.eye(3)
                J[:, 0, 4] = a[:, 2]; J[:, 0, 5] = -a[:, 1]
                J[:, 1, 3] = -a[:, 2]; J[:, 1, 5] = a[:, 0]
                J[:, 2, 3] = a[:, 1]; J[:, 2, 4] = -a[:, 0]
                # residual r ≈ J*dx where dx=[dt, dw]; linearization of (I+[w]x)a + dt - b, d/dw = -[a]x
                H = np.einsum('n,nij,nik->jk', w, J, J)
                g = np.einsum('n,nij,ni->j', w, J, r)
                dx = -np.linalg.solve(H + 1e-6 * np.eye(6), g)
                dR = Rot.from_rotvec(dx[3:]).as_matrix()
                R = dR @ R; t = dR @ t + dx[:3]
                if np.linalg.norm(dx) < 1e-4: break
            # adaptive threshold from model deviation (KISS-ICP like)
            dev = np.linalg.norm(t - pred_t) + max_range * np.linalg.norm(Rot.from_matrix(R @ pred_R.T).as_rotvec()) * 0.5
            sigma = float(np.clip(0.9 * sigma + 0.1 * max(3 * dev, 0.2), 0.2, 2.0))
        prev_R, prev_t = T_R, T_t
        T_R, T_t = R, t
        poses.append((tf, R.copy(), t.copy()))
        W = P @ R.T + t
        Wd = vox_down(W, 0.25)
        # keep map local
        add_map(Wd)
        if f % 10 == 0:
            keep=np.linalg.norm(state['P']-t,axis=1) < max_range*1.2
            state['P']=state['P'][keep]; state['K']=state['K'][keep]
        if f % 2 == 0 or tree is None:
            map_arr = state['P']; tree = cKDTree(map_arr)
        # keep dense output (all points, deskewed, world)
        world_chunks.append(W.astype(np.float32)); refl_chunks.append(refl[sel])
        if f % 200 == 0:
            print(f, nF, len(state['P']), np.round(t, 2), round(sigma, 2), flush=True)
    Wall = np.concatenate(world_chunks); Rall = np.concatenate(refl_chunks)
    traj = np.array([np.r_[p[0], p[2], Rot.from_matrix(p[1]).as_quat()] for p in poses])
    np.savez_compressed(out + '_map.npz', xyz=Wall, r=Rall)
    np.save(out + '_traj.npy', traj)
    L = np.linalg.norm(np.diff(traj[:, 1:4], axis=0), axis=1).sum()
    print('done frames', len(poses), 'path_len_m', round(L, 2), 'end', traj[-1, 1:4])

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
