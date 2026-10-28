<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Pattern geometry lives in src/lib/pattern (pure functions, cm units); UI must call these, not re-implement maths — keeps offsets/mirroring testable.
- Landing camera is driven only by the keyframe timeline in AtelierScene's CameraRig; OrbitControls mount only after user interaction — avoids two systems fighting over the camera.
- Projects persist to localStorage via src/lib/pattern/projects.ts until a cloud backend is added.
