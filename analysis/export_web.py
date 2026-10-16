import numpy as np, json, glob
from scipy.spatial import cKDTree
S=json.load(open('/mnt/user-data/uploads/LIDAR_src/_derived/summary.json'))
SDKFAIL={'2026-09-04_11-06-17','2026-09-04_11-12-06','2026-09-04_11-18-00','2026-09-04_11-23-01','2026-09-04_11-29-49','2026-09-07_13-42-36'}
def smooth_len(T,w=10):
    k=np.ones(w)/w; Ts=np.stack([np.convolve(T[:,i],k,'valid') for i in range(3)],1)
    return float(np.linalg.norm(np.diff(Ts,axis=0),axis=1).sum()), Ts
sessions=[]
for n,v in sorted(S.items()):
    mode='walk' if 'walk' in n else 'static'
    tr=np.load(n+'_traj.npy'); L,Ts=smooth_len(tr[:,1:4])
    date=n[:10]; hm=n[11:16].replace('-',':')
    short=('Sep 7 ' if date.endswith('07') else 'Sep 4 ')+hm
    T2=(Ts[::5,:2]-Ts[:,:2].mean(0)).round(2).tolist()
    sessions.append(dict(id=n,label=n[:19].replace('_',' ').replace('-',':',).replace(':',' -',0), short=short,mode=mode,start=n[:19],
      duration_s=v['duration_s'],points_total=v['points_total'],pts_per_s=v['pts_per_s'],imu_hz=v['imu_hz'],acc_norm_mean=v['acc_norm_mean'],
      gyro_mean=v['gyro_norm_mean_dps'],gyro_p95=v['gyro_norm_p95_dps'],still_frac=v['still_frac'],sdk_fail=n[:16] in SDKFAIL,
      path_len=round(L,1) if mode=='walk' else None, traj=T2 if mode=='walk' else None))
    print(short,mode,round(L,1))
for s in sessions: s['label']=s['short']+(' · walk' if s['mode']=='walk' else ' · static sweep')
VIEW=[('2026-09-04_11-38-41_walk_continuous','Cave chamber','Cave chamber walk · Sep 4, 11:38','A 4.9-minute walk through a cave chamber. The ceiling (top colors) and floor are both captured.',0.06,380000),
      ('2026-09-04_11-18-00_walk_continuous','Trail approach','Trail into the caves · Sep 4, 11:18','5 minutes along the escarpment trail toward the cave entrances, through forest and rock walls.',0.08,380000),
      ('2026-09-04_11-32-50_static_2min','Overhang sweep','Overhang, handheld sweep · Sep 4, 11:32','A 2-minute handheld sweep under a limestone overhang. Points are deskewed and registered with IMU-aided ICP.',0.05,320000),
      ('2026-09-04_11-03-08_static_2min','Forest sweep','Forest and rock face · Sep 4, 11:03','A 2-minute sweep at the first scan station, covering tree trunks, canopy, and the rock face.',0.06,320000)]
clouds=[]
for n,tab,title,sub,vox,cap in VIEW:
    m=np.load(n+'_map.npz'); P=m['xyz']; R=m['r']; tr=np.load(n+'_traj.npy')[:,1:4]
    c=tr.mean(0); P=P-c; T=tr-c
    d,_=cKDTree(T[::10]).query(P,distance_upper_bound=22); keep=np.isfinite(d); P=P[keep]; R=R[keep]
    k=np.floor(P/vox).astype(np.int64); _,u,cnt=np.unique(k,axis=0,return_index=True,return_counts=True)
    u=u[cnt>=2]  # drop isolated noise
    P=P[u]; R=R[u]
    if len(P)>cap:
        idx=np.random.default_rng(0).choice(len(P),cap,replace=False); P=P[idx]; R=R[idx]
    zmin,zmax=np.percentile(P[:,2],[2,98])
    rad=float(np.percentile(np.linalg.norm(P[:,:2],axis=1),90))
    fn=f'data/pc_{n[11:19]}.bin'
    with open('/home/claude/site/'+fn,'wb') as f:
        f.write(np.clip(np.round(P*100),-32000,32000).astype('<i2').tobytes()); f.write(R.astype(np.uint8).tobytes())
    s=[x for x in sessions if x['id']==n][0]
    meta=[[f"{s['duration_s']/60:.1f} min",'recording'],[f"{s['points_total']/1e6:.1f} M",'raw points'],[f"{len(P)/1e3:.0f} k",f'shown ({int(vox*100)} cm voxels)'],
          [f"{s['gyro_mean']:.0f} °/s",'mean rotation (IMU)'],[f"{s['path_len']:.0f} m" if s['path_len'] else f"{zmax-zmin:.1f} m",'smoothed path length' if s['path_len'] else 'height span shown']]
    clouds.append(dict(file=fn,n=int(len(P)),tab=tab,title=title,sub=sub+' Drag to orbit, scroll or pinch to zoom.',zmin=float(zmin),zmax=float(zmax),radius=rad,
        traj=T[::4].round(2).tolist(),meta=meta,view=dict(yaw=-0.7,pitch=0.62,dist=rad*1.45)))
    print(fn,len(P),round(rad,1),round(zmin,1),round(zmax,1))
json.dump(dict(sessions=sessions,clouds=clouds),open('/home/claude/site/data/field.json','w'),separators=(',',':'))
