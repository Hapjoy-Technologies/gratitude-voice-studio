# Gratitude Voice Studio

Internal frontend for generating affirmation audio with the OmniVoice model hosted on Modal.

## Current scope

- GitHub Pages frontend
- Shared access-code login
- Browser-local folder drafts while AWS access is pending
- Prebuilt and custom voice selection
- Modal audio generation
- MP3 generation, preview, and download
- Responsive internal-tool interface inspired by Gratitude's calm visual language

Generated audio currently stays in the browser and is not uploaded to AWS.
The prepared AWS integration remains disabled until a dedicated Lambda role is
created with access limited to `affn-audios/dev/*`.

## Architecture

```text
GitHub Pages -> Modal OmniVoice API -> Browser preview/download
```

No AWS keys, Modal tokens, passwords, or other secrets belong in this public repository.

## Local preview

Serve the repository root with any static server, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.
