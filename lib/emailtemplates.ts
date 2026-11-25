// Default emails sent after a deal is agreed. A client's own saved text (Campaigns page) wins; these are used when it is empty.
// Only {{name}} {{handle}} {{rate}} {{brand}} (+ {{deadline}} {{days}} on the last two) are filled in, so nothing is left in [brackets] for a creator to see:
// deliverables, dates and contact details come from the brief / this email thread, not from the template.

export const DEFAULT_GUIDELINES = `Subject: Quick reminder: our collab guidelines, {{brand}} x @{{handle}}

Hi {{name}},

Thanks again for agreeing to collaborate with {{brand}}. We're excited to get started!

A quick reminder of what we agreed on, so everything runs smoothly for both of us:

THE DELIVERABLES
• The deliverables and go-live window we agreed on in our chat
• 1 month ad rights
• Rate: {{rate}}, locked for 2 months from your first post, with more deliverables planned at the same rate

CONTENT GUIDELINES
• Follow the brief we shared (key messages, dos and don'ts)
• Tag the brand account and use the hashtags/links given in the brief
• Share your draft/script with us for a quick approval before posting. Please don't post before we confirm.

OUR TIMELINE
• Before posting: draft for approval
• Posting day: send us the live link
• Day 5-7 after posting: send screenshots of your Instagram insights (Reels: views, reach, likes, comments, shares, saves, watch time. Stories: views, reach, taps forward/back, exits, replies, link/sticker taps)
• Ongoing: a short check-in while we plan the next deliverables

COMMUNICATION
We'll reply within 24 hours on working days and ask the same of you. If anything changes (a date, a delay, a question on the brief), just tell us early and we'll sort it out together. Simply reply to this email to reach us.

If anything above doesn't match what you remember agreeing to, reply and let us know so we can clear it up right away.

Thanks so much,
{{brand}} Marketing Team`;

export const DEFAULT_SCRIPT = `Subject: {{days}}: {{brand}} x @{{handle}} go-live on {{deadline}}

Hi {{name}},

A quick heads-up that your {{brand}} content is due to go live on {{deadline}} ({{days}}).

A short checklist to stay on track:
• Draft/script: if you haven't shared it yet, please send it today so we have time to approve it before posting. If you've already sent it, we'll confirm shortly.
• Brief: please double-check the key messages, tags and links in the brief we shared.
• Going live: post your deliverables on the agreed date and send us the live link right after.
• After posting: send Instagram insights screenshots 5-7 days after each deliverable goes live.

If anything is holding you up (a date clash, a question on the brief, a product issue), let us know today and we'll sort it out together.

Thanks,
{{brand}} Marketing Team`;

export const DEFAULT_DEADLINE = `Subject: {{days}}: your {{brand}} content goes live on {{deadline}}

Hi {{name}},

Just a final reminder that your {{brand}} content is due to go live on {{deadline}} ({{days}}).

Before you post:
• Make sure we've approved your final draft. Please don't post before we confirm.
• Check the brief: key messages, tag the brand account and use the hashtags/links given.

After you post:
• Send us the live link as soon as it's up.
• Send Instagram insights screenshots 5-7 days after it goes live (the metrics for each deliverable are in our earlier message).

If anything has changed on your side, please reply today so we can adjust the plan. Just reply to this email if you need anything.

Thanks so much,
{{brand}} Marketing Team`;
