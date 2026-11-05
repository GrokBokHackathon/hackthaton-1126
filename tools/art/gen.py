from PIL import Image, ImageDraw
import json, math
P=[("outline","#2B1B33","2px outline, pupils, mouths"),("shadow","#1A1020","drop shadow ONLY, drawn at 35% alpha"),
("face_shadow","#E89A1C","emoji face shade (bottom-right)"),("face","#FFCC33","emoji face base"),("face_hi","#FFF0A0","face highlight blob, stars, lightning"),
("eye_white","#FFFFFF","eye whites, UI text, sparkles"),("blush","#FF8FA0","cheeks, tongue, snail shell"),
("grass_dark","#5BA84A","grass shade/tufts"),("grass","#7CC85A","grass base"),("path","#E8C890","path base"),
("wall_dark","#6A6A8A","wall side/shade"),("wall","#9A9AB8","wall top"),
("bush_dark","#1F6E4E","bush shade (teal-green)"),("bush","#2F9A6A","bush leaves (teal-green)"),
("wood_dark","#8A5230","crate/pole shade"),("wood","#C07A40","crate, flag pole"),
("red_0","#6E1020","Team Red dark"),("red_1","#C42032","Team Red main"),("red_2","#FF7A6E","Team Red light"),
("bot_0","#4A2A90","Team Bot dark"),("bot_1","#A27BFF","Team Bot main (purple)"),("bot_2","#DCC8FF","Team Bot light"),
("water","#4FA8E8","water/pond surface (uses reserved slot 1)"),("water_dark","#2E6FB8","water edge/depth (uses reserved slot 2)"),
("mask_0","#505050","MASK -> team _0 (source only)"),("mask_1","#8C8C8C","MASK -> team _1"),("mask_2","#D0D0D0","MASK -> team _2")]
C={n:tuple(int(h[i:i+2],16) for i in (1,3,5))+(255,) for n,h,_ in P}
SH=C["shadow"][:3]+(89,)
def new(w,h):return Image.new("RGBA",(w,h),(0,0,0,0))
def E(d,b,c,o=True):d.ellipse(b,fill=C[c],outline=C["outline"] if o else None,width=2)
def R(d,x,y,w,h,c):d.rectangle([x,y,x+w-1,y+h-1],fill=C[c])
open("palette.hex","w").write("\n".join(h[1:] for _,h,_ in P)+"\n")
open("palette.gpl","w").write("GIMP Palette\nName: Flag Raid Emoji\nColumns: 5\n#\n"+"".join("%3d %3d %3d %s\n"%(*C[n][:3],n) for n,_,_ in P))
sw=new(5*48,6*48);d=ImageDraw.Draw(sw)
for i,(n,_,_) in enumerate(P):R(d,(i%5)*48,(i//5)*48,48,48,n);d.text(((i%5)*48+2,(i//5)*48+36),n[:8],fill=C["outline"] if n not in("outline","shadow","red_0","bot_0","bush_dark","mask_0","wall_dark","wood_dark") else C["eye_white"])
sw.save("palette.png")
A={}
def add(sheet,img,name,x,y,w=32,h=32):A.setdefault(sheet,{"meta":{"image":img},"frames":{}})["frames"][name]={"x":x,"y":y,"w":w,"h":h}
# ---------- character ----------
def bot(d,ox,oy,dirn,team,sq=0,eyes="norm",mouth=None,badge=None,lean=0):
  t=lambda k:"%s_%d"%(team,k)
  d.ellipse([ox+7,oy+26,ox+25,oy+31],fill=SH)
  x0,y0,x1,y1=ox+4-sq,oy+5+2*sq,ox+28+sq,oy+29
  ax={0:0,1:-3,2:3,3:0}[dirn]+lean
  cx=(x0+x1)//2
  d.line([cx,y0+1,cx+ax,y0-3],fill=C["outline"],width=2)
  E(d,[cx+ax-3,y0-6,cx+ax+3,y0],t(1))
  E(d,[x0,y0,x1,y1],"face")
  d.chord([x0+2,y0+2,x1-2,y1-2],20,110,fill=C["face_shadow"])
  E(d,[x0+5,y0+4,x0+10,y0+8],"face_hi",False)
  # headband
  hy=y0+6
  d.rectangle([x0+2,hy,x1-2,hy+3],fill=C[t(1)]);d.line([x0+3,hy,x1-3,hy],fill=C[t(2)])
  d.line([x0+2,hy+4,x1-2,hy+4],fill=C[t(0)])
  if dirn==3:
    R(d,cx-1,hy+4,3,5,t(0));return
  ex={0:0,1:-4,2:4}[dirn];ey=y0+13
  for s in (-5,5):
    exx=cx+s+ex
    if dirn==1 and s>0 or dirn==2 and s<0:exx-=s//5
    if eyes=="norm":
      E(d,[exx-3,ey-3,exx+3,ey+4],"eye_white");R(d,exx-1+ex//4,ey,2,3,"outline")
    elif eyes=="x":
      d.line([exx-2,ey-2,exx+2,ey+2],fill=C["outline"],width=2);d.line([exx-2,ey+2,exx+2,ey-2],fill=C["outline"],width=2)
    elif eyes=="happy":
      d.arc([exx-3,ey-1,exx+3,ey+4],200,340,fill=C["outline"],width=2)
  if dirn==0:
    R(d,cx-10,ey+4,3,2,"blush");R(d,cx+8,ey+4,3,2,"blush")
  mx=cx+ex
  if mouth=="grin":d.chord([mx-5,ey+4,mx+5,ey+10],0,180,fill=C["outline"]);R(d,mx-3,ey+7,6,1,"eye_white")
  elif mouth=="laugh":d.chord([mx-5,ey+3,mx+5,ey+12],0,180,fill=C["outline"]);R(d,mx-2,ey+9,4,2,"blush")
  elif mouth=="wobble":d.line([mx-3,ey+7,mx-1,ey+6,mx+1,ey+8,mx+3,ey+7],fill=C["outline"],width=1)
  else:d.arc([mx-3,ey+3,mx+3,ey+8],20,160,fill=C["outline"],width=2)
  if badge and dirn!=3:
    bx,by=cx+ex,hy+1
    if badge=="sq":R(d,bx-2,by-1,5,5,"eye_white");R(d,bx-1,by,3,3,team+"_0")
    else:d.ellipse([bx-2,by-1,bx+2,by+3],fill=C["eye_white"]);d.point((bx,by+1),C[team+"_0"])
def star(d,x,y,c="face_hi"):d.polygon([(x,y-3),(x+1,y-1),(x+3,y),(x+1,y+1),(x,y+3),(x-1,y+1),(x-3,y),(x-1,y-1)],fill=C[c],outline=C["outline"])
def charsheet(team,badge,fn):
  im=new(128,192);d=ImageDraw.Draw(im)
  for r,dn in enumerate(["down","left","right","up"]):
    for c,(fr,sq) in enumerate([("idle",0),("run1",1),("run2",-1)]):
      oy=r*32+(-1 if fr=="run2" else 0)
      bot(d,c*32,oy,r,team,sq=sq,badge=badge);add("char",fn,"char_%s_%s"%(dn,fr),c*32,r*32)
  for f in range(2):  # carrier: holds flag stick
    ox=f*32;oy=128
    R(d,ox+25,oy+2,2,22,"wood");pc="red_1" if team!="red" else "bot_1"
    d.polygon([(ox+27,oy+2),(ox+31,oy+4+f),(ox+27,oy+8)],fill=C[pc],outline=C["outline"])
    bot(d,ox,oy+f,0,team,sq=f,mouth="grin",badge=badge);E(d,[ox+23,oy+17,ox+28,oy+22],"face")
    add("char",fn,"char_carry_%d"%f,ox,oy)
  for f in range(2):
    bot(d,64+f*32,128-f,0,team,sq=f,eyes="happy",mouth="laugh",badge=badge,lean=(-2,2)[f]);add("char",fn,"char_taunt_%d"%f,64+f*32,128)
  for f in range(3):
    ox=f*32;oy=160;bot(d,ox,oy,0,team,eyes="x",mouth="wobble",badge=badge,lean=(-2,0,2)[f])
    for k in range(3):
      a=f*1.2+k*2.1;star(d,ox+16+int(10*math.cos(a)),oy+5+int(3*math.sin(a)))
    add("char",fn,"char_dizzy_%d"%f,ox,oy)
  im.save(fn);return im
charsheet("mask",None,"char_mask_sheet_placeholder.png")
SHEETS={t:charsheet(t,b,"char_%s_sheet_placeholder.png"%t) for t,b in [("red","sq"),("bot","round")]}
A["char"]["meta"].update({"image":"char_{team}_sheet_placeholder.png","pivot":[16,30],"note":"same layout for mask/red/bot sheets"})
# ---------- tiles 512x128 ----------
T=new(512,128);d=ImageDraw.Draw(T);TF="tiles_placeholder.png"
def grass(x,y,v):
  R(d,x,y,32,32,"grass")
  for px,py in ([(6,8),(20,5),(12,22),(26,18)] if v==0 else [(4,16),(16,10),(24,26),(10,28),(28,6)]):
    d.line([x+px,y+py,x+px+1,y+py-3],fill=C["grass_dark"],width=1);d.line([x+px+3,y+py,x+px+3,y+py-2],fill=C["grass_dark"])
grass(0,0,0);grass(32,0,1);add("tiles",TF,"grass_a",0,0);add("tiles",TF,"grass_b",32,0)
R(d,64,0,32,32,"path");[d.ellipse([64+a,b,66+a,b+1],fill=C["wood"]) for a,b in [(6,6),(22,12),(10,24)]];add("tiles",TF,"path",64,0)
grass(96,0,0)
for bx,by,r in [(102,10,7),(114,9,7),(108,18,8),(119,19,6)]:E(d,[bx-r,by-r,bx+r,by+r],"bush")
for bx,by in [(104,8),(115,7),(108,16)]:R(d,bx,by,2,2,"grass")
add("tiles",TF,"bush",96,0)
grass(128,0,1);d.ellipse([132,26,156,31],fill=SH);d.rounded_rectangle([131,6,157,28],3,fill=C["wood"],outline=C["outline"],width=2)
R(d,133,20,23,6,"wood_dark")
for bx in (136,142,148):E(d,[bx,3,bx+5,12],"face_shadow");R(d,bx+2,2,2,3,"eye_white")
add("tiles",TF,"crate_beer",128,0)
for m in range(16):
  x=m*32;y=32;grass(x,y,m%2);add("tiles",TF,"wall_%02d"%m,x,y)
  boxes=[(4,4,24,24)]+[b for bit,b in [(1,(4,0,24,6)),(2,(26,4,6,24)),(4,(4,26,24,6)),(8,(0,4,6,24))] if m&bit]
  for a,b,w,h in boxes:R(d,x+a,y+b,w,h,"wall_dark")
  top=[(a,b,w,h-6 if (b+h==28 or (b+h==32 and not m&4 and b==26)) else h) for a,b,w,h in boxes]
  for a,b,w,h in boxes:R(d,x+a,y+b,w,max(h-(6 if b+h>=28 and not (b==0 or (m&4 and b+h==32)) else 0),0),"wall")
  if not m&4:R(d,x+4,y+22,24,6,"wall_dark")
  R(d,x+6,y+6,6,3,"eye_white")
def base(x,t,badge):
  y=64;add("tiles",TF,"base_"+t,x,y,64,64)
  d.ellipse([x+6,y+48,x+58,y+62],fill=SH)
  E(d,[x+4,y+6,x+60,y+58],t+"_0");E(d,[x+8,y+8,x+56,y+52],t+"_1");d.ellipse([x+14,y+12,x+30,y+22],fill=C[t+"_2"])
  if badge=="sq":d.rectangle([x+22,y+20,x+42,y+40],fill=C["eye_white"],outline=C["outline"],width=2)
  else:E(d,[x+21,y+19,x+43,y+41],"eye_white")
base(0,"red","sq");base(64,"bot","round")
T.save(TF)
# ---------- fx/props 256x96 ----------
F=new(256,96);d=ImageDraw.Draw(F);FF="fx_props_placeholder.png"
def flag(x,y,t,f,badge):
  d.ellipse([x+6,y+27,x+14,y+31],fill=SH);R(d,x+8,y+3,3,26,"outline");R(d,x+9,y+4,1,24,"wood")
  w=[(x+11,y+4),(x+29,y+5+f*2),(x+28-f,y+17),(x+11,y+16)];d.polygon(w,fill=C[t+"_1"],outline=C["outline"],width=2)
  R(d,x+12,y+6,8,2,t+"_2")
  if badge=="sq":R(d,x+17,y+8,6,6,"eye_white")
  else:d.ellipse([x+17,y+8,x+23,y+14],fill=C["eye_white"])
for i,(t,b) in enumerate([("red","sq"),("bot","round")]):
  for f in range(2):flag(i*64+f*32,0,t,f,b);add("fx",FF,"flag_%s_%d"%(t,f),i*64+f*32,0)
for f in range(4):
  x=f*32;y=32;r=[4,9,13,15][f]
  d.ellipse([x+16-r,y+16-r,x+15+r,y+15+r],outline=C[["eye_white","face_hi","face","eye_white"][f]],width=[4,3,2,1][f])
  if f<3:star(d,x+16+r//2,y+16-r//2,"eye_white")
  add("fx",FF,"respawn_%d"%f,x,y)
for f in range(3):
  x=128+f*32;y=32;r=[3,8,12][f]
  for k in range(8):
    a=k*math.pi/4;d.line([x+16+int(r*0.5*math.cos(a)),y+16+int(r*0.5*math.sin(a)),x+16+int(r*math.cos(a)),y+16+int(r*math.sin(a))],fill=C[["eye_white","face_hi","face"][f]],width=2)
  add("fx",FF,"tag_hit_%d"%f,x,y)
for i,n in enumerate(["emote_lol","emote_bang","emote_q","emote_skull","emote_beer"]):
  x=i*16;y=64;d.rounded_rectangle([x,y,x+15,y+12],3,fill=C["eye_white"],outline=C["outline"]);d.polygon([(x+4,y+12),(x+8,y+12),(x+4,y+15)],fill=C["outline"])
  if n=="emote_lol":d.text((x+2,y+1),"lol",fill=C["outline"])
  if n=="emote_bang":R(d,x+7,y+2,2,6,"red_1");R(d,x+7,y+9,2,2,"red_1")
  if n=="emote_q":d.text((x+5,y+1),"?",fill=C["outline"])
  if n=="emote_skull":d.ellipse([x+4,y+2,x+11,y+9],fill=C["wall"]);R(d,x+5,y+5,2,2,"outline");R(d,x+9,y+5,2,2,"outline")
  if n=="emote_beer":R(d,x+4,y+3,6,8,"face");R(d,x+4,y+2,6,2,"eye_white");d.rectangle([x+10,y+5,x+12,y+8],outline=C["outline"])
  add("fx",FF,n,x,y,16,16)
x=80;y=64;R(d,x+2,y+2,12,12,"outline");R(d,x+4,y+4,8,8,"red_1");add("fx",FF,"score_red",x,y,16,16)
E(d,[96+2,y+2,96+13,y+13],"bot_1");add("fx",FF,"score_bot",96,y,16,16)
d.polygon([(114,66),(126,66),(120,76)],fill=C["eye_white"],outline=C["outline"]);add("fx",FF,"flag_carried_indicator",112,64,16,16)
F.save(FF)
# ---------- powerups 256x32 ----------
PU=new(256,32);d=ImageDraw.Draw(PU);PF="powerups_placeholder.png"
for i,n in enumerate(["speed","slow","shield","spare"]):
  for f in range(2):
    x=i*64+f*32;b=-f*2;add("powerups",PF,"pu_%s_%d"%(n,f),x,0)
    d.ellipse([x+9,27,x+23,31],fill=SH);E(d,[x+4,3+b,x+28,27+b],"eye_white");d.ellipse([x+8,6+b,x+14,11+b],fill=C["face_hi"])
    cx,cy=x+16,15+b
    if n=="speed":d.polygon([(cx+2,cy-9),(cx-5,cy+1),(cx,cy+1),(cx-2,cy+9),(cx+6,cy-2),(cx+1,cy-2)],fill=C["face"],outline=C["outline"])
    if n=="slow":E(d,[cx-4,cy-6,cx+6,cy+4],"blush");d.arc([cx-1,cy-3,cx+3,cy+1],0,300,fill=C["outline"]);R(d,cx-8,cy+3,15,4,"face_shadow");d.line([cx-7,cy+3,cx-9,cy-3],fill=C["outline"],width=2)
    if n=="shield":d.ellipse([cx-8,cy-8,cx+8,cy+8],outline=C["bot_1"],width=2);d.ellipse([cx-5,cy-5,cx-1,cy-1],fill=C["bot_2"])
    if n=="spare":d.text((cx-3,cy-6),"?",fill=C["wall_dark"])
PU.save(PF)
json.dump(A,open("atlas.json","w"),indent=1)
# ---------- preview 20x12 at x2 ----------
W,H=20,12;M=new(W*32,H*32)
def crop(sheet,img,n):f=A[sheet]["frames"][n];return img.crop((f["x"],f["y"],f["x"]+f["w"],f["y"]+f["h"]))
tl=lambda n:crop("tiles",T,n)
walls=set((x,0) for x in range(W))|set((x,H-1) for x in range(W))|set((0,y) for y in range(H))|set((W-1,y) for y in range(H))
walls|={(6,3),(7,3),(8,3),(8,4),(8,5),(12,8),(11,8),(13,8),(12,7),(10,1),(10,2),(4,8),(4,9),(15,3),(16,3)}
bushes={(5,5),(6,5),(14,6),(14,5),(9,9),(3,4)};crates={(11,4),(9,7),(16,8)}
for y in range(H):
  for x in range(W):
    M.paste(tl("grass_a" if (x*7+y*3)%5 else "grass_b"),(x*32,y*32))
    if (x==y+4 or x==int(y*1.6)) and (x,y) not in walls:M.paste(tl("path"),(x*32,y*32))
for (x,y) in walls:
  m=sum(b for b,(dx,dy) in zip((1,2,4,8),[(0,-1),(1,0),(0,1),(-1,0)]) if (x+dx,y+dy) in walls);M.paste(tl("wall_%02d"%m),(x*32,y*32))
for s,n in [(bushes,"bush"),(crates,"crate_beer")]:
  for x,y in s:M.paste(tl(n),(x*32,y*32))
M.alpha_composite(tl("base_red"),(32,32));M.alpha_composite(tl("base_bot"),((W-3)*32,(H-3)*32))
fl=lambda n:crop("fx",F,n);ch=lambda t,n:crop("char",SHEETS[t],n)
M.alpha_composite(fl("flag_red_0"),(48,40));M.alpha_composite(fl("flag_bot_1"),((W-3)*32+16,(H-3)*32+8))
M.alpha_composite(ch("red","char_right_run1"),(128,96));M.alpha_composite(ch("red","char_down_idle"),(64,192))
M.alpha_composite(ch("red","char_taunt_0"),(224,256))
M.alpha_composite(ch("bot","char_left_run2"),(480,288));M.alpha_composite(ch("bot","char_up_idle"),(400,64))
M.alpha_composite(ch("bot","char_carry_0"),(288,160));M.alpha_composite(fl("flag_carried_indicator"),(296,140))
M.alpha_composite(ch("red","char_dizzy_1"),(352,224))
M.alpha_composite(crop("powerups",PU,"pu_speed_0"),(192,160));M.alpha_composite(crop("powerups",PU,"pu_shield_1"),(512,128))
MAP=M.copy();M=M.resize((W*64,H*64),Image.NEAREST)  # old preview; preview_x2.png now comes from mapgen_reference.py

# ================= COMMAND UI (bots play, humans command) =================
NEAR=Image.NEAREST
FONT={"0":"111101101101111","1":"010110010010111","2":"111001111100111","3":"111001111001111","4":"101101111001001",
"5":"111100111001111","6":"111100111101111","7":"111001010010010","8":"111101111101111","9":"111101111001111","/":"001001010100100"}
def glyph(d,x,y,ch,c="eye_white",s=1):
  b=FONT[ch]
  for i,v in enumerate(b):
    if v=="1":R(d,x+(i%3)*s,y+(i//3)*s,s,s,c)
def text(d,x,y,st,c="eye_white",s=1,o=True):
  for k,ch in enumerate(st):
    if o:
      for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(1,1)]:glyph(d,x+k*4*s+dx*s//1 if s==1 else x+k*4*s+dx*(s//2+0),y+dy*(1 if s==1 else s//2),ch,"outline",s)
    glyph(d,x+k*4*s,y,ch,c,s)
def ico(n):
  im=new(32,32);d=ImageDraw.Draw(im)
  if n=="rally":
    d.polygon([(9,13),(22,6),(22,26),(9,19)],fill=C["red_1"],outline=C["outline"]);R(d,6,12,5,8,"face");d.rectangle([5,12,10,19],outline=C["outline"])
    R(d,11,19,3,7,"outline");[d.arc([20,8+k,30,24-k],-50,50,fill=C["outline"],width=2) for k in (0,)]
  if n=="scout":
    for ex in (10,22):E(d,[ex-6,8,ex+6,24],"eye_white");E(d,[ex-1,13,ex+4,20],"outline",False)
  if n=="defend":
    d.rectangle([5,12,26,26],fill=C["wall"],outline=C["outline"],width=2)
    for bx in (5,13,21):d.rectangle([bx,7,bx+5,13],fill=C["wall"],outline=C["outline"],width=2)
    R(d,7,22,18,3,"wall_dark");d.chord([12,17,19,28],180,360,fill=C["outline"])
  if n=="escort":
    for cx in (10,22):E(d,[cx-7,9,cx+7,23],"face");R(d,cx-3,14,2,3,"outline");R(d,cx+2,14,2,3,"outline");d.line([cx,9,cx,5],fill=C["outline"],width=2)
    d.line([12,24,20,24],fill=C["outline"],width=3);E(d,[13,21,19,27],"face")
  if n=="attack":
    R(d,7,5,3,22,"outline");d.polygon([(10,5),(22,8),(10,13)],fill=C["red_1"],outline=C["outline"])
    d.polygon([(14,20),(23,20),(23,16),(29,22),(23,28),(23,24),(14,24)],fill=C["face"],outline=C["outline"])
  if n=="tag":
    E(d,[4,4,28,28],"red_1");E(d,[9,9,23,23],"eye_white");E(d,[13,13,19,19],"red_1")
  if n=="reroute":
    d.arc([6,6,26,26],180,20,fill=C["outline"],width=6);d.arc([6,6,26,26],180,20,fill=C["bot_1"],width=3)
    d.polygon([(20,20),(29,14),(29,24)],fill=C["bot_1"],outline=C["outline"]);R(d,5,15,4,12,"outline");R(d,6,16,2,10,"bot_1")
  if n=="beer":
    d.rectangle([8,8,22,27],fill=C["face"],outline=C["outline"],width=2);d.ellipse([7,4,23,12],fill=C["eye_white"],outline=C["outline"],width=2)
    d.arc([19,12,28,23],-90,90,fill=C["outline"],width=3);R(d,11,14,2,10,"face_hi")
  return im
ORD=["rally","scout","defend","escort","attack","tag","reroute","beer"]
def grey(im):
  px=im.load();out=im.copy();po=out.load()
  for y in range(im.height):
    for x in range(im.width):
      c=px[x,y]
      if c[3]==255:
        L=sum(c[:3])/3;po[x,y]=C["outline"] if L<70 else C["mask_0"] if L<130 else C["mask_1"] if L<200 else C["mask_2"]
  return out
def bubble(state):
  im=new(32,32);d=ImageDraw.Draw(im);o=2 if state=="pressed" else 0
  if state!="pressed":d.ellipse([4,25,28,31],fill=SH)
  E(d,[1,1+o,30,30],{"normal":"eye_white","pressed":"wall","disabled":"mask_1"}[state])
  if state=="normal":d.ellipse([6,5,12,10],fill=C["face_hi"])
  return im
UI=new(256,80);UF="ui_orders_placeholder.png"
for i,st in enumerate(["normal","pressed","disabled"]):UI.alpha_composite(bubble(st),(i*32,0));add("ui_orders",UF,"btn_"+st,i*32,0)
def badge16(n):
  b=new(16,16);d=ImageDraw.Draw(b);E(d,[0,0,15,15],"eye_white");b.alpha_composite(ico(n).resize((12,12),NEAR),(2,2));return b
for i,n in enumerate(ORD):
  UI.alpha_composite(ico(n),(i*32,32));add("ui_orders",UF,"ord_"+n,i*32,32)
  UI.alpha_composite(badge16(n),(i*16,64));add("ui_orders",UF,"badge_"+n,i*16,64,16,16)
cur=new(16,16);d=ImageDraw.Draw(cur);d.line([2,2,13,13],fill=C["outline"],width=5);d.line([2,13,13,2],fill=C["outline"],width=5)
d.line([3,3,12,12],fill=C["red_1"],width=2);d.line([3,12,12,3],fill=C["red_1"],width=2);UI.alpha_composite(cur,(128,64));add("ui_orders",UF,"cursor_invalid",128,64,16,16)
UI.save(UF)
# economy 96x40
EC=new(96,40);d=ImageDraw.Draw(EC);EF="ui_economy_placeholder.png"
def coin(sz):
  im=new(32,32);dd=ImageDraw.Draw(im);E(dd,[2,2,29,29],"face");dd.chord([5,5,27,27],20,110,fill=C["face_shadow"]);dd.ellipse([8,6,13,10],fill=C["face_hi"])
  cx,cy=16,16;dd.polygon([(cx+2,cy-9),(cx-5,cy+1),(cx,cy+1),(cx-2,cy+9),(cx+6,cy-2),(cx+1,cy-2)],fill=C["eye_white"],outline=C["outline"])
  return im if sz==32 else im.resize((16,16),NEAR)
EC.alpha_composite(coin(32),(0,0));add("ui_economy",EF,"cp_coin_32",0,0);EC.alpha_composite(coin(16),(32,0));add("ui_economy",EF,"cp_coin_16",32,0,16,16)
d.rectangle([48,0,55,11],fill=C["face"],outline=C["outline"]);R(d,50,2,2,7,"face_hi");add("ui_economy",EF,"pip_full",48,0,8,12)
d.rectangle([56,0,63,11],fill=C["mask_0"],outline=C["outline"]);add("ui_economy",EF,"pip_empty",56,0,8,12)
d.rectangle([66,2,77,13],fill=C["path"],outline=C["outline"]);d.ellipse([64,0,69,5],fill=C["path"],outline=C["outline"]);d.ellipse([75,11,79,15],fill=C["path"],outline=C["outline"])
for k in range(3):R(d,68,5+k*3,7,1,"wood_dark")
add("ui_economy",EF,"orders_counter",64,0,16,16)
d.rounded_rectangle([80,0,91,9],2,fill=C["outline"]);add("ui_economy",EF,"cost_plate",80,0,12,10)
for i in range(11):
  g_="0123456789/"[i];R(d,i*6,32,6,8,"outline");glyph(d,i*6+1,33+1,g_);add("ui_economy",EF,"digit_"+("slash" if g_=="/" else g_),i*6,32,6,8)
EC.save(EF)
# fx command 224x64
FC=new(224,64);d=ImageDraw.Draw(FC);CF="fx_command_placeholder.png"
for i,t in enumerate(["red","bot"]):
  for f in range(2):
    x=i*64+f*32;d.ellipse([x+1,1,x+30,14],outline=C["outline"],width=4);d.ellipse([x+2,2,x+29,13],outline=C[t+("_1" if f==0 else "_2")],width=2)
    for a in ((0,1) if f==0 else (2,3)):
      px_,py_=[(x+3,7),(x+28,7),(x+15,1),(x+15,12)][a];R(d,px_-1,py_-1,3,3,"eye_white")
    add("fx_command",CF,"sel_ring_%s_%d"%(t,f),x,0,32,16)
  for f in range(3):
    x=i*96+f*32;y=16;r=[5,10,14][f];w=[3,2,2][f]
    d.ellipse([x+16-r,y+16-r//2,x+16+r,y+16+r//2],outline=C["outline"],width=w+2);d.ellipse([x+16-r+1,y+16-r//2+1,x+16+r-1,y+16+r//2-1],outline=C[t+"_1"],width=w)
    add("fx_command",CF,"ping_%s_%d"%(t,f),x,y)
  x=192+i*16;y=16;E(d,[x+3,y,x+12,y+9],t+"_1");R(d,x+6,y+3,3,3,"eye_white");d.polygon([(x+5,y+8),(x+10,y+8),(x+7,y+15)],fill=C["outline"])
  add("fx_command",CF,"pin_"+t,x,y,16,16)
for f in range(3):
  x=f*16;y=48;E(d,[x+3,y,x+15,y+9],"eye_white");E(d,[x+1,y+10,x+4,y+13],"eye_white");E(d,[x,y+13,x+2,y+15],"eye_white")
  for k in range(3):R(d,x+5+k*3,y+4,2,2,"outline" if k<=f else "wall")
  add("fx_command",CF,"emote_thinking_%d"%f,x,y,16,16)
for f in range(2):
  x=48+f*16+(f*2-1);y=48;d.rectangle([x+2,y+4,x+12,y+11],fill=C["eye_white"],outline=C["outline"]);R(d,x+13,y+6,2,4,"outline");R(d,x+4,y+6,2,4,"red_1")
  d.line([x+9,y+1,x+7,y+14],fill=C["red_1"],width=1) if f else None
  add("fx_command",CF,"emote_broke_%d"%f,x-(f*2-1),y,16,16)
FC.save(CF)
# ---------------- mocks ----------------
def fr(sheet,img,n):f=A[sheet]["frames"][n];return img.crop((f["x"],f["y"],f["x"]+f["w"],f["y"]+f["h"]))
def build(Wt,Ht,walls,bushes,crates,units,sel,ping,pu):
  M=new(Wt*32,Ht*32)
  wl=set((x,0) for x in range(Wt))|set((x,Ht-1) for x in range(Wt))|set((0,y) for y in range(Ht))|set((Wt-1,y) for y in range(Ht))|walls
  for y in range(Ht):
    for x in range(Wt):
      M.paste(tl("grass_a" if (x*7+y*3)%5 else "grass_b"),(x*32,y*32))
      if (x==y+2 or x+y==Wt+Ht-6) and (x,y) not in wl:M.paste(tl("path"),(x*32,y*32))
  for (x,y) in wl:
    m=sum(b for b,(dx,dy) in zip((1,2,4,8),[(0,-1),(1,0),(0,1),(-1,0)]) if (x+dx,y+dy) in wl);M.paste(tl("wall_%02d"%m),(x*32,y*32))
  for s_,n in [(bushes,"bush"),(crates,"crate_beer")]:
    for x,y in s_:M.paste(tl(n),(x*32,y*32))
  M.alpha_composite(tl("base_red"),(32,32));M.alpha_composite(tl("base_bot"),((Wt-3)*32,(Ht-3)*32))
  M.alpha_composite(fl("flag_red_0"),(48,40));M.alpha_composite(fl("flag_bot_1"),((Wt-3)*32+16,(Ht-3)*32+8))
  for n,(x,y) in pu:M.alpha_composite(fr("powerups",PU,n),(x,y))
  d=ImageDraw.Draw(M)
  if ping:
    t,(x,y)=ping;M.alpha_composite(fr("fx_command",FC,"ping_%s_2"%t),(x-16,y-16));M.alpha_composite(fr("fx_command",FC,"pin_"+t),(x-8,y-15))
  if sel:
    (x,y),(tx,ty)=sel
    M.alpha_composite(fr("fx_command",FC,"sel_ring_red_0"),(x,y+20))
    L=max(abs(tx-x-16),abs(ty-y-26));
    for k in range(0,L,8):
      px_=x+16+(tx-x-16)*k//L;py_=y+26+(ty-y-26)*k//L;R(d,px_-2,py_-2,5,5,"outline");R(d,px_-1,py_-1,3,3,"red_2")
  for t,n,(x,y),b in units:
    M.alpha_composite(ch(t,n),(x,y))
    if b=="think":M.alpha_composite(fr("fx_command",FC,"emote_thinking_2"),(x+20,y-10))
    elif b:M.alpha_composite(fr("ui_orders",UI,"badge_"+b),(x+8,y-12))
  if sel:M.alpha_composite(fr("ui_orders",UI,"badge_attack"),(sel[0][0]+8,sel[0][1]-12))
  return M
def big(img,s):return img.resize((img.width*s,img.height*s),NEAR)
COST=[("rally",1),("scout",1),("defend",2),("escort",3),("attack",3),("tag",4)]
DIS={"escort"}  # no own carrier yet -> disabled
def panel(w,h,cols,bs=2):
  P_=new(w,h);d=ImageDraw.Draw(P_);d.rounded_rectangle([0,0,w-1,h-1],10,fill=C["outline"],outline=C["wall_dark"],width=3)
  y=12;P_.alpha_composite(big(coin(16),2),(12,y));
  for k in range(10):P_.alpha_composite(big(fr("ui_economy",EC,"pip_full" if k<6 else "pip_empty"),2),(50+k*18,y+4))
  text(d,50+10*18+8,y+8,"6/10","face",3)
  y+=44;P_.alpha_composite(big(fr("ui_economy",EC,"orders_counter"),2),(12,y));text(d,52,y+8,"9/15","path",3)
  y+=48;bw=32*bs;gap=(w-cols*bw)//(cols+1)
  for i,(n,c) in enumerate(COST):
    x=gap+(i%cols)*(bw+gap);yy=y+(i//cols)*(bw+34)
    st="disabled" if n in DIS else ("pressed" if n=="attack" else "normal")
    P_.alpha_composite(big(bubble(st),bs),(x,yy));ic=ico(n);ic=grey(ic) if st=="disabled" else ic
    P_.alpha_composite(big(ic,bs),(x,yy+(4 if st=="pressed" else 0)))
    cx=x+bw//2-16;d.rounded_rectangle([cx,yy+bw+2,cx+31,yy+bw+24],4,fill=C["wall_dark"] if st=="disabled" else C["face"],outline=C["eye_white"],width=2)
    P_.alpha_composite(big(coin(16),1).resize((16,16),NEAR),(cx+2,yy+bw+5));text(d,cx+20,yy+bw+6,str(c),"outline" if st!="disabled" else "eye_white",3,o=False)
  return P_
u=[("red","char_right_run1",(128,96),"rally"),("red","char_down_idle",(64,224),"defend"),("red","char_left_run2",(256,384),"think"),
   ("bot","char_left_run2",(288,448),"attack"),("bot","char_up_idle",(320,96),"scout"),("bot","char_carry_0",(192,288),"escort"),("red","char_dizzy_1",(224,192),None)]
# portrait 390x844
Wt,Ht=12,16
AR=build(Wt,Ht,{(5,3),(6,3),(7,3),(7,4),(3,8),(4,8),(8,10),(8,11),(9,10),(4,13),(5,13)},{(2,5),(9,6),(6,9),(3,14)},{(9,3),(6,12),(2,11)},
  [x if x[1]!="char_left_run2" or x[0]!="bot" else ("bot","char_left_run2",(224,416),"attack") for x in u],((64,224),(300,240)),("red",(300,240)),[("pu_speed_0",(160,128)),("pu_shield_1",(96,416))])
PM=Image.new("RGBA",(390,844),C["outline"]);PM.alpha_composite(AR.crop((0,0,384,528)),(3,6))
d=ImageDraw.Draw(PM);d.rounded_rectangle([3,6,386,533],6,outline=C["wall_dark"],width=2)
PM.alpha_composite(panel(384,300,3),(3,540));PM.save("ui_mock_portrait.png")
# landscape 1280x720
Wt,Ht=29,22
AR=build(Wt,Ht,{(6,3),(7,3),(8,3),(8,4),(8,5),(12,8),(11,8),(13,8),(12,7),(10,1),(10,2),(4,8),(4,9),(15,3),(16,3),(20,12),(21,12),(22,12),(18,16),(18,17),(25,6),(25,7)},
  {(5,5),(6,5),(14,6),(14,5),(9,9),(3,4),(22,15),(23,15),(17,10)},{(11,4),(9,7),(16,8),(24,18),(20,4)},
  u+[("bot","char_down_idle",(720,560),"defend"),("red","char_right_run2",(560,320),"rally")],((560,320),(800,480)),("red",(800,480)),
  [("pu_speed_0",(192,160)),("pu_shield_1",(640,192))])
LM=Image.new("RGBA",(1280,720),C["outline"]);LM.alpha_composite(AR,(16,8))
d=ImageDraw.Draw(LM);d.rounded_rectangle([14,6,945,713],6,outline=C["wall_dark"],width=2)
LM.alpha_composite(panel(312,704,2,bs=3),(960,8));LM.save("ui_mock_landscape.png")

# ================= TILES2: terrain + props =================
T2=new(512,160);d=ImageDraw.Draw(T2);T2F="tiles2_placeholder.png"
def g2(x,y,v=0):
  R(d,x,y,32,32,"grass")
  for px,py in ([(6,8),(20,5),(12,22),(26,18)] if v==0 else [(4,16),(16,10),(24,26),(10,28),(28,6)]):
    d.line([x+px,y+py,x+px+1,y+py-3],fill=C["grass_dark"])
ARMS=[(1,(9,0,14,12)),(2,(20,9,12,14)),(4,(9,20,14,12)),(8,(0,9,12,14))]
for m in range(16):
  # path autotile (row 0): soft blob + arms, wood-coloured pebbles
  x=m*32;y=0;g2(x,y,m%2);add("tiles2",T2F,"path_%02d"%m,x,y)
  d.ellipse([x+7,y+7,x+24,y+24],fill=C["path"])
  for bit,(a,b,w,h) in ARMS:
    if m&bit:R(d,x+a,y+b,w,h,"path")
  for bits,(a,b) in [((1,2),(20,0)),((2,4),(20,20)),((4,8),(0,20)),((8,1),(0,0))]:
    if m&bits[0] and m&bits[1]:d.pieslice([x+a+(4 if a else 0)-8+ (8 if a else 0),y+b-8+(8 if b else 0),x+a+20-(8 if not a else 0)+ (0),y+b+20-(8 if not b else 0)],0,360,fill=C["path"]) if False else R(d,x+a+(0 if a else 6),y+b+(0 if b else 6),6,6,"path")
  d.point((x+12,y+14),C["wood"]);d.point((x+19,y+18),C["wood"])
  # water autotile (row 1)
  x=m*32;y=32;g2(x,y,m%2);add("tiles2",T2F,"water_%02d"%m,x,y)
  d.ellipse([x+4,y+4,x+27,y+27],fill=C["water_dark"])
  for bit,(a,b,w,h) in [(1,(4,0,24,14)),(2,(18,4,14,24)),(4,(4,18,24,14)),(8,(0,4,14,24))]:
    if m&bit:R(d,x+a,y+b,w,h,"water_dark")
  d.ellipse([x+6,y+6,x+25,y+24],fill=C["water"])
  for bit,(a,b,w,h) in [(1,(6,0,20,14)),(2,(18,6,14,19)),(4,(6,18,20,14)),(8,(0,6,14,19))]:
    if m&bit:R(d,x+a,y+b,w,h,"water")
  for bits,(a,b) in [((1,2),(18,0)),((2,4),(18,18)),((4,8),(0,18)),((8,1),(0,0))]:
    if m&bits[0] and m&bits[1]:R(d,x+a,y+b,14,14,"water")
  R(d,x+10,y+10,4,1,"eye_white");R(d,x+18,y+19,3,1,"eye_white")
P2=["bridge_h","bridge_v","tall_grass","flowers","rock_small","rock_big","laptop_desk","pizza_box","beer_keg","server_rack","mud","pebbles","sign","cable"]
for i,n in enumerate(P2):
  x=i*32;y=64;add("tiles2",T2F,n,x,y)
  if n.startswith("bridge"):
    R(d,x,y,32,32,"water");R(d,x+8,y+20,4,1,"eye_white")
    if n=="bridge_h":
      R(d,x,y+5,32,22,"outline")
      for k in range(0,32,6):R(d,x+k,y+7,min(5,32-k),18,"wood");R(d,x+k,y+22,min(5,32-k),3,"wood_dark")
    else:
      R(d,x+5,y,22,32,"outline")
      for k in range(0,32,6):R(d,x+7,y+k,18,min(5,32-k),"wood");R(d,x+22,y+k,3,min(5,32-k),"wood_dark")
    continue
  g2(x,y,i%2)
  if n=="tall_grass":
    for k in range(7):bx=x+3+k*4;d.polygon([(bx,y+28),(bx+3,y+28),(bx+1+(k%2)*2,y+8+(k%3)*4)],fill=C["grass_dark" if k%2 else "bush"])
  if n=="flowers":
    for fx_,fy,c in [(7,9,"blush"),(20,7,"eye_white"),(13,20,"face"),(25,22,"blush"),(6,25,"eye_white")]:
      d.line([x+fx_,y+fy+2,x+fx_,y+fy+5],fill=C["grass_dark"]);d.ellipse([x+fx_-2,y+fy-2,x+fx_+2,y+fy+2],fill=C[c]);d.point((x+fx_,y+fy),C["face"])
  if n=="rock_small":
    d.ellipse([x+8,y+22,x+24,y+28],fill=SH);E(d,[x+8,y+12,x+24,y+26],"wall");d.chord([x+10,y+14,x+22,y+24],20,140,fill=C["wall_dark"]);R(d,x+12,y+15,3,2,"eye_white")
  if n=="rock_big":
    d.ellipse([x+3,y+22,x+30,y+31],fill=SH);E(d,[x+2,y+4,x+30,y+28],"wall");d.chord([x+5,y+7,x+27,y+25],10,150,fill=C["wall_dark"]);E(d,[x+16,y+12,x+28,y+24],"wall");R(d,x+8,y+8,5,3,"eye_white")
  if n=="laptop_desk":
    d.ellipse([x+3,y+25,x+29,y+31],fill=SH);d.rectangle([x+2,y+12,x+29,y+26],fill=C["wood"],outline=C["outline"],width=2);R(d,x+4,y+22,24,3,"wood_dark")
    d.rectangle([x+9,y+4,x+22,y+14],fill=C["mask_0"],outline=C["outline"],width=2);R(d,x+12,y+7,8,4,"bot_2");R(d,x+8,y+15,16,3,"mask_2")
  if n=="pizza_box":
    d.ellipse([x+4,y+24,x+28,y+30],fill=SH);d.rectangle([x+4,y+8,x+27,y+26],fill=C["path"],outline=C["outline"],width=2)
    E(d,[x+8,y+11,x+23,y+24],"face");[E(d,[x+a,y+b,x+a+3,y+b+3],"red_1",False) for a,b in [(11,14),(17,15),(14,19)]]
  if n=="beer_keg":
    d.ellipse([x+6,y+25,x+26,y+31],fill=SH);d.rounded_rectangle([x+7,y+5,x+24,y+28],5,fill=C["wall"],outline=C["outline"],width=2)
    R(d,x+8,y+10,16,2,"wall_dark");R(d,x+8,y+22,16,2,"wall_dark");R(d,x+10,y+6,3,20,"eye_white");R(d,x+14,y+2,4,4,"face")
  if n=="server_rack":
    d.ellipse([x+5,y+26,x+27,y+31],fill=SH);d.rectangle([x+6,y+2,x+25,y+28],fill=C["mask_0"],outline=C["outline"],width=2)
    for k in range(4):R(d,x+9,y+5+k*6,14,4,"outline");R(d,x+10,y+6+k*6,2,2,"bot_1" if k%2 else "grass")
  if n=="mud":
    d.ellipse([x+2,y+4,x+30,y+28],fill=C["wood_dark"]);d.ellipse([x+6,y+8,x+20,y+18],fill=C["wood"]);R(d,x+20,y+20,3,2,"path");R(d,x+9,y+21,2,2,"path")
  if n=="pebbles":
    for a,b in [(6,8),(9,10),(22,20),(25,22),(14,26)]:d.ellipse([x+a,y+b,x+a+3,y+b+2],fill=C["wall"]);d.point((x+a+1,y+b+2),C["wall_dark"])
  if n=="sign":
    d.ellipse([x+11,y+26,x+21,y+30],fill=SH);R(d,x+15,y+14,3,14,"outline");R(d,x+16,y+14,1,13,"wood_dark")
    d.rectangle([x+5,y+5,x+26,y+16],fill=C["wood"],outline=C["outline"],width=2);d.polygon([(x+10,y+11),(x+18,y+11),(x+18,y+8),(x+23,y+11),(x+18,y+14),(x+18,y+11)],fill=C["eye_white"])
  if n=="cable":
    pts=[(x,y+20),(x+8,y+14),(x+16,y+20),(x+24,y+12),(x+31,y+16)];d.line(pts,fill=C["outline"],width=3);d.line(pts,fill=C["bot_0"],width=1)
# tree 64x64 at (0,96)
x,y=0,96;add("tiles2",T2F,"tree",x,y,64,64)
d.ellipse([x+10,y+48,x+54,y+62],fill=SH);R(d,x+26,y+38,12,20,"outline");R(d,x+28,y+40,8,17,"wood");R(d,x+33,y+40,3,17,"wood_dark")
for bx,by,r in [(20,26,15),(44,26,15),(32,16,16),(32,34,14)]:E(d,[x+bx-r,y+by-r,x+bx+r,y+by+r],"bush")
for bx,by,r in [(44,30,9),(32,38,8)]:d.ellipse([x+bx-r,y+by-r,x+bx+r,y+by+r],fill=C["bush_dark"])
for bx,by in [(22,14),(30,8),(16,22)]:E(d,[x+bx,y+by,x+bx+6,y+by+4],"grass",False)
T2.save(T2F)
json.dump(A,open("atlas.json","w"),indent=1)
# snap all opaque pixels to nearest palette colour (text labels / composited shadows)
import glob
pal=[C[n][:3] for n,_,_ in P if n!="shadow"]
for f in glob.glob("*.png"):
  im=Image.open(f).convert("RGBA");px=im.load();cache={}
  for y in range(im.height):
    for x in range(im.width):
      c=px[x,y]
      if c[3]==255:
        if c not in cache:cache[c]=min(pal,key=lambda p:sum((a-b)**2 for a,b in zip(c[:3],p)))+(255,)
        px[x,y]=cache[c]
  im.save(f)
