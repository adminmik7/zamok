# Zamok — rules for agents

## No comments in code

Write no comments. Not line comments, not block comments, not KDoc, not docstrings, not
explanatory XML comments in the manifest, layouts, drawables, themes or strings, and not in
build files either. Code arrives without commentary.

Why, so the rule is not argued away later: the code is the record. Anything worth saying
belongs in the commit message, in README.md, or in the reply to the user — all three outlive
the comment, and none of them end up contradicting the code they sit next to.

This overrides the global instruction to mark deliberate simplifications with a `ponytail:`
comment. Name the simplification and its ceiling in the commit message or the reply instead.

Comments already in the repository stay as they are unless the user asks for them to be
stripped — this rule is about what gets written from now on.
