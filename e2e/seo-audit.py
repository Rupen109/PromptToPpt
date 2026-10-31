"""Crawls every URL in a sitemap and reports SEO problems: title/description length, canonical, one H1, noindex, og:image, structured data.
Usage: python3 e2e/seo-audit.py https://slidesdone.app"""
import re, sys, urllib.request, concurrent.futures as cf
base=sys.argv[1] if len(sys.argv)>1 else 'https://slidesdone.app'
def get(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'seo-audit'}),timeout=40); return r.status, r.read().decode('utf8','replace')
    except Exception as e: return getattr(e,'code',0), ''
st,x=get(base+'/sitemap.xml'); urls=re.findall(r'<loc>(.*?)</loc>',x)
def audit(u):
    s,h=get(u)
    if s!=200: return u,[f'HTTP {s}']
    p=[]
    t=re.search(r'<title>(.*?)</title>',h,re.S); t=t.group(1).strip() if t else ''
    d=re.search(r'<meta name="description" content="(.*?)"',h); d=d.group(1) if d else ''
    c=re.search(r'rel="canonical" href="(.*?)"',h); c=c.group(1) if c else ''
    if not t: p.append('no title')
    elif len(t)>65: p.append(f'title {len(t)} chars (long)')
    elif len(t)<20: p.append(f'title {len(t)} chars (short)')
    if not d: p.append('no description')
    elif len(d)>165: p.append(f'description {len(d)} chars (long)')
    elif len(d)<70: p.append(f'description {len(d)} chars (short)')
    if c.rstrip('/')!=u.rstrip('/'): p.append(f'canonical={c or "none"}')
    n=len(re.findall(r'<h1[\s>]',h)); 
    if n!=1: p.append(f'{n} h1')
    if re.search(r'name="robots" content="[^"]*noindex',h): p.append('NOINDEX')
    if 'og:image' not in h: p.append('no og:image')
    if 'ld+json' not in h: p.append('no structured data')
    return u,p
with cf.ThreadPoolExecutor(6) as ex: res=list(ex.map(audit,urls))
bad=[(u,p) for u,p in res if p]
print(f'{len(urls)} urls, {len(urls)-len(bad)} clean, {len(bad)} with findings')
from collections import Counter
print(Counter(f.split(' ')[0]+' '+f.split(' ')[1] if ' ' in f else f for u,p in bad for f in p).most_common(12))
for u,p in bad[:25]: print(u.replace(base,''),'->',', '.join(p))
