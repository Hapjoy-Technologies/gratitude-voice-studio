# Gratitude Voice Studio

Internal frontend for generating affirmation audio with the OmniVoice model hosted on Modal.

## Current scope

- GitHub Pages frontend
- Shared access-code login
- Browser-local folder drafts
- Prebuilt and custom voice selection
- Modal audio generation
- Audio preview and WAV download

AWS Lambda and S3 persistence are intentionally not implemented yet. Generated audio is not shared or permanently stored by this frontend.

## Architecture

```text
GitHub Pages -> Modal OmniVoice API -> Browser preview/download
```

Future confirmed flow:

```text
Browser confirmation -> AWS Lambda -> S3
```

No AWS keys, Modal tokens, passwords, or other secrets belong in this public repository.

## Local preview

Serve the repository root with any static server, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.
