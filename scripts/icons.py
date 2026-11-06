#!/usr/bin/env python3
"""The daypart and weather icons: 19 colour SVGs on a 16 px grid, always on black.

Design source, not a build step: `python3 scripts/icons.py` rewrites
src/buoy@murilegus/icons/{daypart,weather}-*.svg; `gjs -m scripts/icons-sheet.js`
renders docs/icons.png. Chosen 2026-11-06 (Ethan: palette A, soft blue cloud).
Every part carries an id (sun, moon, cloud, rain, snow, bolt, wind…) so a tab can
split an icon into layers and animate them later."""
import math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'src', 'buoy@murilegus', 'icons')
os.makedirs(OUT, exist_ok=True)

SUN, PEACH, TEAL, INK = '#FFD23F', '#FFB889', '#5CD6E6', '#000000'
CLOUD, CLOUD_DARK = '#CFE6FB', '#7FA8D0'      # soft blue-white cloud, steel-blue back cloud
SNOW, FOG, HORIZON = '#BFF2FA', '#9DBBD6', '#7A838D'

def f(v): return f'{v:.2f}'.rstrip('0').rstrip('.')

def line(x1, y1, x2, y2, sw, color):
    return f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(sw)}" stroke-linecap="round"/>'

def sun(cx, cy, r, ri, ro, sw, color=SUN, n=8, off=0):
    s = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{color}"/>']
    for i in range(n):
        a = math.radians(off + i * 360 / n)
        s.append(line(cx + ri*math.cos(a), cy + ri*math.sin(a), cx + ro*math.cos(a), cy + ro*math.sin(a), sw, color))
    return f'<g id="sun">{"".join(s)}</g>'

def half_sun(cx, cy, r, ri, ro, sw, color=PEACH):
    s = [f'<path d="M{f(cx-r)} {f(cy)}A{f(r)} {f(r)} 0 0 1 {f(cx+r)} {f(cy)}Z" fill="{color}"/>']
    for deg in (225, 270, 315):
        a = math.radians(deg)
        s.append(line(cx + ri*math.cos(a), cy + ri*math.sin(a), cx + ro*math.cos(a), cy + ro*math.sin(a), sw, color))
    return f'<g id="sun">{"".join(s)}</g>'

def moon(cx, cy, r, color=TEAL):
    # crescent: outer circle minus a cut circle offset to the upper right
    d, r2 = 0.62 * r, 0.86 * r
    ux, uy = 0.80, -0.60                       # unit vector to the cut centre
    cx2, cy2 = cx + d*ux, cy + d*uy
    a = (r*r - r2*r2 + d*d) / (2*d)            # distance from c to the chord
    h = math.sqrt(max(r*r - a*a, 0))
    mx, my = cx + a*ux, cy + a*uy
    p1 = (mx - h*uy, my + h*ux); p2 = (mx + h*uy, my - h*ux)
    return (f'<path id="moon" d="M{f(p1[0])} {f(p1[1])}A{f(r)} {f(r)} 0 1 1 {f(p2[0])} {f(p2[1])}'
            f'A{f(r2)} {f(r2)} 0 0 0 {f(p1[0])} {f(p1[1])}Z" fill="{color}"/>')

def star(cx, cy, s, color=SUN):
    k = 0.32 * s
    return (f'<path d="M{f(cx)} {f(cy-s)}Q{f(cx+k)} {f(cy-k)} {f(cx+s)} {f(cy)}Q{f(cx+k)} {f(cy+k)} {f(cx)} {f(cy+s)}'
            f'Q{f(cx-k)} {f(cy+k)} {f(cx-s)} {f(cy)}Q{f(cx-k)} {f(cy-k)} {f(cx)} {f(cy-s)}Z" fill="{color}"/>')

def cloud(x, y, w, h, color=CLOUD, gid='cloud'):
    rr = 0.275 * h
    big = (x + 0.60*w, y + 0.42*h, 0.42*h)
    sm = (x + 0.27*w, y + 0.50*h, 0.34*h)
    return (f'<g id="{gid}" fill="{color}"><circle cx="{f(big[0])}" cy="{f(big[1])}" r="{f(big[2])}"/>'
            f'<circle cx="{f(sm[0])}" cy="{f(sm[1])}" r="{f(sm[2])}"/>'
            f'<rect x="{f(x)}" y="{f(y+h-2*rr)}" width="{f(w)}" height="{f(2*rr)}" rx="{f(rr)}"/></g>')

def drops(xs, y0, y1, sw=1.4, dx=-0.8, color=TEAL):
    return '<g id="rain">' + ''.join(line(x, y0, x + dx, y1, sw, color) for x in xs) + '</g>'

def dots(pts, r, color=SNOW):
    return '<g id="snow">' + ''.join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}"/>' for x, y in pts) + '</g>'

def bolt(pts, color=SUN):
    return f'<path id="bolt" d="M{" ".join(f(x)+" "+f(y) for x, y in pts)}Z" fill="{color}" stroke="{color}" stroke-width="0.5" stroke-linejoin="round"/>'

def svg(*parts):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">'
            + ''.join(parts) + '</svg>\n')

# ---- daypart: horizon + faint arc, shared ----------------------------------
HY, AR = 14.2, 5.6
def horizon():
    return (f'<path id="arc" d="M{f(8-AR)} {f(HY)}A{f(AR)} {f(AR)} 0 0 1 {f(8+AR)} {f(HY)}" fill="none" '
            f'stroke="{HORIZON}" stroke-width="1" stroke-dasharray="0.01 1.5" stroke-linecap="round" opacity="0.6"/>'
            + line(1, HY, 15, HY, 1.2, HORIZON).replace('<line', '<line id="horizon"'))
def on_arc(deg):
    a = math.radians(deg); return 8 + AR*math.cos(a), HY - AR*math.sin(a)

icons = {}
mx, my = on_arc(124); ax, ay = on_arc(56)
icons['daypart-dawn'] = svg(horizon(), half_sun(3.8, HY, 3.2, 3.9, 5.4, 1.2))
icons['daypart-morning'] = svg(horizon(), sun(mx, my, 2.1, 2.8, 3.6, 1.1, off=22.5))
icons['daypart-noon'] = svg(horizon(), sun(8, HY - AR, 2.1, 2.8, 3.6, 1.1, off=22.5))
icons['daypart-afternoon'] = svg(horizon(), sun(ax, ay, 2.1, 2.8, 3.6, 1.1, off=22.5))
icons['daypart-evening'] = svg(horizon(), half_sun(12.2, HY, 3.2, 3.9, 5.4, 1.2))
icons['daypart-night'] = svg(horizon(), moon(7.4, 8.4, 3.6), star(12.4, 4.4, 1.2), star(11.8, 9.4, 0.75))

# ---- weather ----------------------------------------------------------------
icons['weather-clear'] = svg(sun(8, 8, 3.7, 5.0, 6.9, 1.5))
icons['weather-clear-night'] = svg(moon(7.2, 8.6, 5.2), star(12.8, 3.6, 1.5), star(13.8, 8.2, 0.8))
icons['weather-few-clouds'] = svg(sun(5.2, 5.4, 2.9, 3.7, 4.7, 1.2), cloud(3.0, 6.6, 12.5, 7.6))
icons['weather-few-clouds-night'] = svg(moon(5.4, 5.2, 3.6), cloud(3.0, 6.6, 12.5, 7.6))
icons['weather-overcast'] = svg(cloud(3.5, 1.5, 12, 7, CLOUD_DARK, 'cloud-back'), cloud(0.5, 6.0, 13, 8))
icons['weather-fog'] = svg(cloud(0.5, 1.2, 15, 8.2),
                           '<g id="fog">' + line(2.2, 11.6, 11.0, 11.6, 1.4, FOG) + line(5.0, 14.3, 13.8, 14.3, 1.4, FOG) + '</g>')
icons['weather-showers-scattered'] = svg(sun(4.8, 4.6, 2.5, 3.2, 4.1, 1.1), cloud(3.0, 5.6, 12.5, 6.8),
                                         drops([7.4, 11.4], 13.2, 15.0))
icons['weather-showers'] = svg(cloud(0.5, 1.0, 15, 8), drops([4.6, 8.4, 12.2], 10.6, 14.6, 1.5, -1.0))
icons['weather-snow'] = svg(cloud(0.5, 1.0, 15, 8), dots([(4.2, 11.6), (8, 13.9), (11.8, 11.6)], 1.2))
icons['weather-storm'] = svg(cloud(0.5, 0.8, 15, 7.6),
                             bolt([(8.9, 8.0), (5.6, 12.4), (8.0, 12.4), (6.8, 15.3), (10.6, 10.9), (8.4, 10.9), (9.9, 8.0)]),
                             drops([3.6, 13.2], 9.8, 12.4, 1.4, -0.7))
icons['weather-windy'] = svg('<g id="wind" fill="none" stroke="' + TEAL + '" stroke-width="1.5" stroke-linecap="round">'
                             '<path d="M1 5.4H10.2a1.9 1.9 0 1 0-1.9-1.9"/>'
                             '<path d="M1 9H13.2a2 2 0 1 1-2 2"/>'
                             '<path d="M1 12.6H7.6a1.5 1.5 0 1 1-1.5 1.5"/></g>')
icons['weather-tornado'] = svg('<g id="tornado">' + ''.join(line(*p, 1.6, TEAL) for p in
                               [(1.2, 2.6, 14.8, 2.6), (2.8, 5.6, 13.6, 5.6), (4.8, 8.6, 12.6, 8.6), (6.6, 11.6, 11.2, 11.6), (8.6, 14.5, 10.4, 14.5)]) + '</g>')
icons['weather-severe-alert'] = svg(f'<path id="sign" d="M8 1.6 15 14H1Z" fill="{SUN}" stroke="{SUN}" stroke-width="1.6" stroke-linejoin="round"/>',
                                    f'<rect x="7.2" y="5.4" width="1.6" height="5.1" rx="0.8" fill="{INK}"/><circle cx="8" cy="12.3" r="0.95" fill="{INK}"/>')

for name, body in icons.items():
    with open(os.path.join(OUT, name + '.svg'), 'w') as fh: fh.write(body)
print(len(icons), 'icons →', OUT)
