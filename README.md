# EndoHer

**The AI health advocate for endometriosis.**
*How you feel IS valid.*

Keep a timeline of your symptoms so every appointment starts with the full picture. EndoHer logs what you've been experiencing in your own words, maps it to clinical terms a doctor recognises, and builds a record you can bring to every visit — so the pattern of what you're living with becomes visible over time.

Built for the [ZOE Women in Tech Hackathon 2026](https://zoe.com) · Team 5

## The problem

Endometriosis takes an average of **9 years and 4 months** to diagnose in the UK — and **11 years** for women from ethnically diverse communities. **83%** of women were told by a healthcare practitioner they were making a fuss about nothing. Almost half visited their GP ten or more times before anyone joined the dots.

The problem isn't that these women stay silent. It's what they say gets lost — scattered across years of ten-minute appointments, each one starting almost from scratch.

*Source: Endometriosis UK, State of Endometriosis Care (2026)*

## What EndoHer does

**Daily check-in (under 30 seconds):**
- NHS-standard pain scale (0–10)
- Pain site selection (pelvis, lower back, abdomen, legs)
- Symptom tick-boxes (GI, menstrual, fatigue)
- One free-text box: describe it in your own words, however feels natural

**Clinical mapping:**
- Your words are mapped to vocabulary a doctor recognises — kept alongside your own words, never replacing them
- Nothing is diagnosed. Nothing is decided. The clinician interprets

**Pattern over time:**
- Entries build into a timestamped record with a visual heatmap
- Brings continuity to appointments that currently start cold
- Surfaces what hasn't been described yet — the questions a clinician may still want to ask (SOCRATES clinical framework)

**GP-ready report:**
- Download a structured PDF summary to bring to your appointment
- Her words, the clinical terms, and the gap-map — all in one document

## The line we deliberately don't cross

This is the heart of the project:

- EndoHer never diagnoses, scores, or draws conclusions
- EndoHer never replaces a clinician — it prepares a woman to be heard by one
- Your words are yours — export or delete, always
- EndoHer is for patterns over time, not medical emergencies. Severe or sudden symptoms → call 111, or 999 if urgent

## Tech stack

- **Frontend:** [Lovable](https://lovable.dev) (React + TypeScript)
- **Backend:** Supabase (auth, database, storage)
- **AI pipeline:** Anthropic Claude API (symptom normalisation, SOCRATES annotation)
- **PDF generation:** Client-side report generation

## Roadmap

- Multilingual logging — log in the language your body speaks
- Spoken read-back — hear your record before you hand it over
- Anonymised community patterns — the ZOE COVID Symptom Study model, applied to women's health (descriptive only, never predictive)
- Co-design with clinicians and diagnosed patients

## Live demo

🔗 https://endoher.dev

## Team

Team 5 · ZOE Women in Tech Hackathon 2026

---

*See what time reveals.* EndoHer means the meaningful interval between things — the space where health patterns emerge.
