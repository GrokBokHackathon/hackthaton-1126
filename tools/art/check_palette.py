# Opaque pixels must be within RGB distance 12 of a palette colour; partial alpha allowed (AA edges, 35% shadow).
import glob,sys
from PIL import Image
pal=[tuple(int(l[i:i+2],16) for i in (0,2,4)) for l in open("palette.hex").read().split()]
bad=0
for f in sorted(glob.glob("*.png")):
  cs=Image.open(f).convert("RGBA").getcolors(1<<24)
  errs=[c for n,c in cs if c[3]==255 and min(sum((a-b)**2 for a,b in zip(c[:3],p))**.5 for p in pal)>12]
  print(("OK  " if not errs else "FAIL"),f,len(cs),"colours",errs[:5]);bad+=bool(errs)
sys.exit(bad)
