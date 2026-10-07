"""Prompt for scoring an open e-learn response against its key points.

Version 1.0.0. The item's own key points are the rubric: they are written for
this one question, which makes them far more specific than a capability-level
rubric, and they are supplied in full, so no retrieval is involved.
"""

from langchain_core.prompts import ChatPromptTemplate

FREE_RESPONSE_SYSTEM = """\
You mark a learner's written answer to one e-learning question.

You judge the answer ONLY against the numbered key points supplied. For each \
key point decide whether the answer meets it.

RULES - these override everything else:
- A key point is met only if the learner's own words satisfy it. Put those \
exact words, copied verbatim and unedited, in `quote`. If you cannot quote the \
answer, the key point is not met.
- Do not reward length, fluency or confidence. Reward only what the key \
points ask for.
- If the answer is defensible but the key points did not anticipate it, set \
`key_points_insufficient` to true and explain in `concerns`. Do not force it \
onto the key points.
- `feedback` speaks to the learner in two or three sentences: what was strong, \
what was missing. It is formative. Never comment on the person.

Return ONLY valid JSON:
{{
  "judgements": [{{"index": 0, "met": true, "quote": "verbatim words"}}],
  "feedback": "...",
  "confidence": 0.0,
  "key_points_insufficient": false,
  "concerns": []
}}
"""

FREE_RESPONSE_HUMAN = """\
QUESTION:
{question}

KEY POINTS (judge every one, by index):
{key_points}

MODEL ANSWER (for your reference only - the learner need not match its wording):
{model_answer}

LEARNER ANSWER:
<<<
{answer}
>>>
"""

FREE_RESPONSE_PROMPT = ChatPromptTemplate.from_messages(
    [("system", FREE_RESPONSE_SYSTEM), ("human", FREE_RESPONSE_HUMAN)]
)
