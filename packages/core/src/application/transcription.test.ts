import { beforeEach, describe, expect, it } from 'vitest'
import { FAKE_TRANSCRIPT_SEGMENTS } from '../testing'
import { GetPlayback } from './playback'
import { RenderVideo } from './rendering'
import { createTestBed, NOW } from './test-bed'
import { TranscribeVideo } from './transcription'
import { RequestTranscription, UpdateVideo } from './video-management'

describe('transcription', () => {
  let bed: Awaited<ReturnType<typeof createTestBed>>
  const transcribe = (videoId: string, version: number) =>
    new TranscribeVideo(bed.deps).execute({ videoId, version })
  const render = (videoId: string, version: number) =>
    new RenderVideo(bed.deps).execute({ videoId, version })
  const play = (videoId: string) => new GetPlayback(bed.deps).execute({ viewerId: null, videoId })

  beforeEach(async () => {
    bed = await createTestBed()
  })

  it('transcribes each finished render, detecting the language', async () => {
    const video = await bed.recorded()
    expect(bed.renders.transcriptionJobs).toEqual([])
    await render(video.id, 1)
    expect(bed.renders.transcriptionJobs).toEqual([{ videoId: video.id, version: 1 }])

    await expect(transcribe(video.id, 1)).resolves.toBe('transcribed')
    expect(bed.recognizer.calls).toEqual([
      { mediaKey: 'videos/vid_1/r1/video.mp4', language: 'auto' },
    ])
    expect(await bed.transcripts.find(video.id)).toEqual({
      videoId: video.id,
      renderVersion: 1,
      language: 'es',
      segments: FAKE_TRANSCRIPT_SEGMENTS,
      createdAt: NOW,
    })
    expect((await bed.videos.findById(video.id))?.transcriptionState).toBe('ready')
    expect((await (await play(video.id)).transcript())?.segments).toEqual(FAKE_TRANSCRIPT_SEGMENTS)
  })

  it('hides a transcript that belongs to an older render', async () => {
    const video = await bed.recorded()
    await render(video.id, 1)
    await transcribe(video.id, 1)
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
      trim: { startMs: 1000, endMs: 5000 },
    })
    expect(await (await play(video.id)).transcript()).toBeNull()
    await render(video.id, 2)
    expect(await (await play(video.id)).transcript()).toBeNull()
    expect(bed.renders.transcriptionJobs.at(-1)).toEqual({ videoId: video.id, version: 2 })
  })

  it('transcribes again in the language the owner picks', async () => {
    const video = await bed.recorded()
    // Before any render there is nothing to transcribe yet; the render will queue it.
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
      transcriptLanguage: 'en',
    })
    expect(bed.renders.transcriptionJobs).toEqual([])

    await render(video.id, 1)
    await new UpdateVideo(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
      transcriptLanguage: 'es',
    })
    expect(bed.renders.transcriptionJobs.map((j) => j.version)).toEqual([1, 2])
    await expect(transcribe(video.id, 1)).resolves.toBe('stale')
    await transcribe(video.id, 2)
    expect(bed.recognizer.calls.at(-1)?.language).toBe('es')
    await expect(
      new UpdateVideo(bed.deps).execute({
        userId: 'owner_1',
        videoId: video.id,
        transcriptLanguage: 'xx' as never,
      }),
    ).rejects.toMatchObject({ code: 'video.language_invalid' })
  })

  it('marks videos without sound, failures, and discards results that went stale', async () => {
    const video = await bed.recorded()
    await render(video.id, 1)
    const rendered = (await bed.videos.findById(video.id))!
    await bed.videos.saveRender(video.id, 1, {
      state: 'ready',
      render: { ...rendered.render!, hasAudio: false },
    })
    await expect(transcribe(video.id, 1)).resolves.toBe('no_audio')
    expect((await bed.videos.findById(video.id))?.transcriptionState).toBe('no_audio')

    await bed.videos.saveRender(video.id, 1, { state: 'ready', render: rendered.render! })
    const retried = await new RequestTranscription(bed.deps).execute({
      userId: 'owner_1',
      videoId: video.id,
    })
    expect(retried.transcriptionState).toBe('queued')
    bed.recognizer.error = new Error('whisper crashed')
    await expect(transcribe(video.id, 2)).rejects.toThrow('whisper crashed')
    expect((await bed.videos.findById(video.id))?.transcriptionState).toBe('failed')

    bed.recognizer.error = null
    await bed.videos.requestTranscription(video.id)
    const original = bed.recognizer.transcribe.bind(bed.recognizer)
    bed.recognizer.transcribe = async (input) => {
      await bed.videos.requestTranscription(video.id)
      return original(input)
    }
    await expect(transcribe(video.id, 3)).resolves.toBe('stale')
    expect(await bed.transcripts.find(video.id)).toBeNull()
    await expect(transcribe('missing', 1)).resolves.toBe('stale')
  })

  it('needs a render before transcribing on request, and survives a queue outage', async () => {
    const video = await bed.recorded()
    await expect(
      new RequestTranscription(bed.deps).execute({ userId: 'owner_1', videoId: video.id }),
    ).rejects.toMatchObject({ code: 'video.not_ready' })
    bed.renders.failing = true
    await render(video.id, 1)
    expect((await bed.videos.findById(video.id))?.transcriptionState).toBe('failed')
  })
})
