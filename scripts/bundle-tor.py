"""Bundle Homebrew-maintained Tor bottles without installing Homebrew or changing system libraries.
Pinned SHA256s verified against formulae.brew.sh and Homebrew/homebrew-core on 2026-11-16.
Only project-local files are changed. No root required. Network downloads are bounded.
"""
import hashlib, json, pathlib, shutil, subprocess, tempfile, urllib.request, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
PACKAGES = [
 ('tor','0.4.9.17','9364972fd66247bde591aa1d3207d07091d484a0aa30c9e887cbe074f18c783e'),
 ('libevent','2.1.13','55344e687f9be992ae9dca23aad5bf6f3bbaa9e63031915cd2738da11787500b'),
 ('libscrypt','1.22','7a251107f146f88d993fa4fe542c8fbd92d9123904359f91ac5f44aedbb90344'),
 ('openssl/4','4.1.0','6fcbad388ef13f6f9481e91676e2ec1b49f0a3dbd473e838297a3c8850283978')]
def fetch(url, headers=None):
 cmd=['curl','--fail','--location','--silent','--show-error','--retry','2','--retry-all-errors','--retry-delay','2','--connect-timeout','10','--max-time','50']
 for key,value in (headers or {}).items(): cmd+=['-H',key+': '+value]
 return subprocess.check_output(cmd+[url],timeout=165)
out=ROOT/'vendor/tor';out.mkdir(parents=True,exist_ok=True);(out/'lib').mkdir(exist_ok=True);(out/'licenses').mkdir(exist_ok=True)
provenance=[]
for existing in out.rglob('*'):
 if existing.is_file(): existing.chmod(existing.stat().st_mode|0o200)
with tempfile.TemporaryDirectory(prefix='tom-tor-bottles-') as tmp:
 tmp=pathlib.Path(tmp)
 for name,version,sha in PACKAGES:
  url=f'https://ghcr.io/v2/homebrew/core/{name}/blobs/sha256:{sha}'
  token=json.loads(fetch(f'https://ghcr.io/token?service=ghcr.io&scope=repository:homebrew/core/{name}:pull'))['token']
  cache=pathlib.Path(tempfile.gettempdir())/('tom-bottle-'+sha+'.tar.gz')
  blob=cache.read_bytes() if cache.exists() else fetch(url,{'Authorization':'Bearer '+token})
  if hashlib.sha256(blob).hexdigest()!=sha: raise RuntimeError('SHA256 mismatch: '+name)
  cache.write_bytes(blob)
  archive=tmp/(name.replace('/','-')+'.tar.gz');archive.write_bytes(blob)
  entries=subprocess.check_output(['tar','-tzf',str(archive)],text=True).splitlines()
  if any(e.startswith('/') or '..' in pathlib.PurePosixPath(e).parts for e in entries): raise RuntimeError('Unsafe archive path')
  dest=tmp/name.replace('/','-');dest.mkdir();subprocess.run(['tar','-xzf',str(archive),'-C',str(dest)],check=True)
  for p in dest.rglob('*'):
   if not p.is_file() or p.is_symlink(): continue
   if p.name=='tor' and p.parent.name=='bin': shutil.copy2(p,out/'tor')
   if p.suffix=='.dylib': shutil.copy2(p,out/'lib'/p.name)
   if p.name.lower().startswith(('license','copying','notice')): shutil.copy2(p,out/'licenses'/(name.replace('/','-')+'-'+p.name))
   if p.name in ['geoip','geoip6']: shutil.copy2(p,out/p.name)
  provenance.append({'package':name,'version':version,'source':url,'sha256':sha,'upstream':'https://formulae.brew.sh/formula/'+name.replace('/','@'),'bottle':'arm64_sequoia'})
# Rewrite all Homebrew paths into bundle-relative dylib references; retain system dylibs.
files=[out/'tor',*list((out/'lib').glob('*.dylib'))]
for f in files:
 lines=subprocess.check_output(['otool','-L',str(f)],text=True).splitlines()[1:]
 if f.suffix=='.dylib': subprocess.run(['install_name_tool','-id','@loader_path/'+f.name,str(f)],check=True)
 for line in lines:
  dep=line.strip().split(' (')[0]
  if dep.startswith(('/opt/homebrew/','@@HOMEBREW')):
   basename=pathlib.Path(dep).name
   if basename==f.name: continue
   target=out/'lib'/basename
   if not target.exists(): raise RuntimeError('Missing runtime dependency: '+dep)
   relative='@executable_path/lib/' if f.name=='tor' else '@loader_path/'
   subprocess.run(['install_name_tool','-change',dep,relative+basename,str(f)],check=True)
 subprocess.run(['codesign','--force','--sign','-',str(f)],check=True,stdout=subprocess.DEVNULL)
(out/'PROVENANCE.json').write_text(json.dumps(provenance,indent=2)+'\n')
subprocess.run([str(out/'tor'),'--version'],check=True)
print('Bundled Tor in',out)
