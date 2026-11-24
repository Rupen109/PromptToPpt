/**
 * DEVELOPMENT ONLY. The segmentation model, alone in its own process (started by cutout-engine.ts). It lives in a process of its own so that stopping a job is real: the parent
 * kills this process (SIGKILL) and the work and its memory (BiRefNet peaks at several GB) are gone, which a timeout around an in-process native call can never promise.
 *
 * Plain TypeScript with erasable syntax only and no imports of ours: it must run as it is (Node's type stripping) in development and as dist/cutout-child.js when built.
 *
 * Model: BiRefNet (lite) ONNX, revision pinned, run with Transformers.js. NOT approved for production (training-data licensing, docs/BACKGROUND_REMOVAL_EVALUATION.md).
 */
const MODEL = { id: 'onnx-community/BiRefNet_lite-ONNX', revision: 'de15b22ba131738a16dff04aab8bdf8dc32e3ac1', dtype: 'fp32' } as const

type Job = { id: number; rgb: Uint8Array; width: number; height: number }

let loaded: Promise<(rgb: Uint8Array, width: number, height: number) => Promise<Uint8Array>> | null = null

async function load() {
  const tf = await import('@huggingface/transformers')
  tf.env.cacheDir = process.env['CUTOUT_MODEL_DIR'] ?? `${process.cwd()}/.local/models`
  tf.env.allowRemoteModels = process.env['CUTOUT_ALLOW_DOWNLOAD'] !== '0'
  tf.env.allowLocalModels = false
  const model = await tf.AutoModel.from_pretrained(MODEL.id, { dtype: MODEL.dtype, revision: MODEL.revision })
  const processor = await tf.AutoProcessor.from_pretrained(MODEL.id, { revision: MODEL.revision })
  return async (rgb: Uint8Array, width: number, height: number) => {
    const image = new tf.RawImage(new Uint8ClampedArray(rgb), width, height, 3)
    const { pixel_values } = await (processor as unknown as (i: unknown) => Promise<{ pixel_values: unknown }>)(image)
    const { output_image } = (await (model as unknown as (i: unknown) => Promise<{ output_image: { [k: number]: { sigmoid(): { mul(n: number): { to(t: string): unknown } } } } }>)({ input_image: pixel_values }))
    const matte = await tf.RawImage.fromTensor(output_image[0]!.sigmoid().mul(255).to('uint8') as never).resize(width, height)
    return Uint8Array.from(matte.data)
  }
}

const send = (m: unknown) => { process.send?.(m) }

process.on('message', async (m: Job | { warm: true }) => {
  if ('warm' in m) {
    loaded ??= load()
    try { await loaded; send({ warm: true }) } catch (e) { loaded = null; send({ warm: false, error: e instanceof Error ? e.message : String(e) }) }
    return
  }
  try {
    loaded ??= load()
    const run = await loaded
    const mask = await run(m.rgb, m.width, m.height)
    send({ id: m.id, mask })
  } catch (e) {
    loaded = null
    send({ id: m.id, error: e instanceof Error ? e.message : String(e) })
  }
})

// the parent is gone: do not linger with gigabytes of memory
process.on('disconnect', () => process.exit(0))
send({ ready: true })

export {} // a module, so its names stay out of the global scope
