# Gratitude Voice Studio

Internal frontend for generating affirmation audio with the OmniVoice model hosted on Modal.

## Current scope

- GitHub Pages frontend
- Shared access-code login
- Shared folder and audio drafts in the isolated `affn-audios/dev/` prefix
- Prebuilt and custom voice selection
- Modal audio generation
- Configurable sentence pauses for long-form YouTube scripts
- MP3 generation, preview, download, and persistent ordering
- Multiple voice versions for one ordered affirmation folder
- Library sections plus AWS-backed folder editing, cover images, and deletion
- Read-only loading of the 66 staging categories, affirmation text, authors, and
  existing audio tracks from `v3_dev.json`
- Existing app voices remain playable and read-only while new generated voices
  are stored separately in AWS dev storage
- Checkbox-based multi-voice generation for a category, processed sequentially
  and saved one MP3 at a time directly to `affn-audios/dev/`
- Responsive internal-tool interface inspired by Gratitude's calm visual language

The first recording creates the affirmation. **Add another voice** reuses that
affirmation's identifier and stores only an additional MP3/voice metadata record.
It does not duplicate the folder or its text.

The isolated Lambda role can read and write only `affn-audios/dev/*`. It reads
`v3_dev.json` as a catalog but cannot modify that file or the production
`v2.json`. App-mapping promotion remains a separate workflow.

## Architecture

```text
GitHub Pages -> Modal OmniVoice API -> isolated AWS Lambda -> affn-audios/dev
```

No AWS keys, Modal tokens, passwords, or other secrets belong in this public repository.

## Local preview

Serve the repository root with any static server, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.
