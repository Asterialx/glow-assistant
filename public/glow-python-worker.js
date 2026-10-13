let runtime = null, queue = Promise.resolve();
const namespaces = new Map();
async function getRuntime() {
  if (!runtime) runtime = (async () => {
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
    return loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'});
  })().catch(error => { runtime=null; throw error; });
  return runtime;
}
self.onmessage = ({data}) => {
  queue = queue.then(async () => {
    let output = '';
    try {
      if (typeof data.id !== 'string' || typeof data.code !== 'string' || data.code.length > 500000) throw new Error('Invalid Python cell');
      const py = await getRuntime();
      if (!namespaces.has(data.id)) {
        if (namespaces.size >= 20) { const oldest = namespaces.keys().next().value; namespaces.get(oldest).destroy(); namespaces.delete(oldest); }
        namespaces.set(data.id, py.toPy({}));
      }
      const capture = line => { if(output.length < 50000) output += line + '\n'; };
      py.setStdout({batched:capture}); py.setStderr({batched:capture});
      const result = await py.runPythonAsync(data.code, {globals:namespaces.get(data.id)});
      if(result != null) output += String(result).slice(0,10000);
      result?.destroy?.();
      self.postMessage({request:data.request,output:output.trim() || '(ok)'});
    } catch(error) { self.postMessage({request:data.request,error:output + (error instanceof Error ? error.message : String(error))}); }
  });
};
