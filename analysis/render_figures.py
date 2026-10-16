import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
cm=LinearSegmentedColormap.from_list('t',[(.12,.16,.42),(.16,.39,.72),(.12,.65,.66),(.38,.82,.48),(.85,.96,.42)])
def load(n,vox):
    m=np.load(n+'_map.npz'); P=m['xyz']; tr=np.load(n+'_traj.npy')[:,1:4]; c=tr.mean(0)
    P=P-c; k=np.floor(P/vox).astype(np.int64); _,u,cnt=np.unique(k,axis=0,return_index=True,return_counts=True)
    return P[u[cnt>=2]], tr-c
def out(fig,fn): fig.savefig('/home/claude/site/assets/field/'+fn,dpi=100,facecolor='#07080a'); plt.close(fig)
# top-down of cave chamber
P,T=load('2026-09-04_11-38-41_walk_continuous',0.05)
P=P[(P[:,2]<1.0)&(P[:,2]>-3)]; z0,z1=np.percentile(P[:,2],[2,99]); o=np.argsort(P[:,2])
fig=plt.figure(figsize=(16,10),facecolor='#07080a'); a=fig.add_axes([0,0,1,1]); a.set_facecolor('#07080a')
cx,cy=T[:,0].mean(),T[:,1].mean()
a.scatter(P[o,0],P[o,1],s=0.3,c=P[o,2],cmap=cm,vmin=z0,vmax=z1,linewidths=0,alpha=.95)
a.plot(T[:,0],T[:,1],color='white',lw=1.1,alpha=.9); a.plot(T[0,0],T[0,1],'o',ms=7,mfc='#07080a',mec='white',mew=1.5)
a.set_aspect('equal'); a.set_xlim(cx-17,cx+17); a.set_ylim(cy-10.6,cy+10.6); a.axis('off')
a.plot([cx-15.5,cx-10.5],[cy-9.6,cy-9.6],color='#b4bac3',lw=1.5); a.text(cx-15.5,cy-9.3,'5 m',color='#b4bac3',fontsize=13,family='monospace')
out(fig,'render-top.png')
# side of overhang static: slice
P,T=load('2026-09-04_11-32-50_static_2min',0.03)
sl=P[np.abs(P[:,1])<1.5]; z0,z1=np.percentile(P[:,2],[2,98])
fig=plt.figure(figsize=(16,5),facecolor='#07080a'); a=fig.add_axes([0,0,1,1]); a.set_facecolor('#07080a')
o=np.argsort(-np.abs(sl[:,1]))
a.scatter(sl[o,0],sl[o,2],s=0.35,c=sl[o,2],cmap=cm,vmin=z0,vmax=z1,linewidths=0)
a.set_aspect('equal'); a.set_xlim(-13,11); a.set_ylim(-3.6,3.9); a.axis('off')
a.plot([-12,-10],[-3,-3],color='#b4bac3',lw=1.5); a.text(-12,-2.8,'2 m',color='#b4bac3',fontsize=13,family='monospace')
out(fig,'render-side.png')
