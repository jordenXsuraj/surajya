// Local test data shared by seed.mjs (creates it) and run.mjs (puts it back before steps that
// change it). Everything lives in the local Docker database only.

export const SEED_COLLEGE = 'Seed Test College';
export const SEED_PASSWORD = 'seedpass123';
export const TESTER = { email: 'tester@meetnet.local', password: 'MeetNet-Test-2026', name: 'Test Student' };

// The three feed authors from Prompt 3 (emails seed-<0|1|2>-<suffix>@example.com, found by name)
export const BASE_PEOPLE = [
  { key: 'riya', name: 'Riya Deshmukh', year: '3rd', branch: 'CS' },
  { key: 'kabir', name: 'Kabir Shah', year: '4th', branch: 'IT' },
  { key: 'sneha', name: 'Sneha Kulkarni', year: '2nd', branch: 'ENTC' },
];

const yt = (url) => ({ type: 'youtube', url });
const ig = (handle) => ({ type: 'instagram', url: `https://www.instagram.com/${handle}/` });

// Profile people for Prompt 5 (emails seed-p-<key>@example.com). Photos are picsum.photos ids
// (landscapes and objects, no people), uploaded through the API so they live in server/uploads.
export const PROFILE_PEOPLE = [
  {
    key: 'arjun', name: 'Arjun Patil', year: '4th', branch: 'CS', username: 'arjun.patil',
    contributor: true, avatar: 1015, cover: 1018,
    bio: 'Final-year CS. Full-stack dev, placement mentor and hackathon regular.\nAsk me anything about DSA or interviews 🚀',
    skills: ['React', 'Node.js', 'MongoDB', 'DSA', 'System Design', 'Docker'],
    projects: [
      { name: 'Placement Tracker', link: 'github.com/arjun-patil/placement-tracker' },
      { name: 'Campus Bus Live', link: 'https://campusbus.example.com' },
      { name: 'DSA Flashcards', link: '' },
    ],
    roadmap: 'Sem 7: system design + 2 mock interviews a week\nSem 8: internship → full-time offer\nAfter: open-source maintainer',
    mediaItems: [
      yt('https://www.youtube.com/watch?v=aqz-KE-bpKQ'),
      yt('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
      yt('https://youtu.be/ScMzIvxBSi4'),
      yt('https://www.youtube.com/live/jNQXAC9IVRw'),
      ig('arjun.builds'),
    ],
    // Older item types that PUT /users/me no longer accepts but old profiles still have:
    // a playlist link with a video id (shown as a video) and a channel link (no video id: not shown)
    legacyMedia: [
      { type: 'yt-playlist', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb' },
      { type: 'yt-channel', url: 'https://www.youtube.com/@Blender' },
    ],
    posts: [
      { type: 'placement', text: 'Cracked my final round! Sharing the exact DSA topics they asked — thread below 🧵' },
      { type: 'project', text: 'Placement Tracker v2 is live: deadlines, rounds and offers in one place.', imageUrl: 'https://picsum.photos/id/1041/1200/800' },
      { type: 'study', text: 'My system design notes for beginners (load balancers, caching, queues).', youtubeUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
      { type: 'qa', text: 'Which is better for the first internship: a startup or a big company? Share your experience.' },
      { type: 'confession', text: 'I almost dropped out in second year. Glad I did not.', isAnonymous: true },
    ],
  },
  {
    key: 'meera', name: 'Meera Joshi', year: '3rd', branch: 'IT', username: 'meera.codes', avatar: 1040,
    bio: 'Android + Kotlin. Running the coding club this year.',
    skills: ['Kotlin', 'Android', 'Firebase', 'UI/UX'],
    projects: [{ name: 'Canteen Pre-order App', link: 'github.com/meera-codes/canteen' }],
    roadmap: '',
    mediaItems: [ig('meera.codes')],
    posts: [
      { type: 'social', text: 'Coding club meetup this Friday at 5 pm, lab 3. Bring your laptops!', imageUrl: 'https://picsum.photos/id/1043/1200/1200' },
      { type: 'qa', text: 'Anyone tried Jetpack Compose for a college project? Worth it?' },
      { type: 'study', text: 'Sharing my Android lifecycle cheat sheet — DM if you want the PDF.' },
    ],
  },
  {
    key: 'rohan', name: 'Rohan Kale', year: '2nd', branch: 'Mechanical', username: 'rohan.kale', avatar: 1039, cover: 1044,
    bio: 'Mech, but I code on weekends. SAE team 🏎️',
    skills: ['SolidWorks', 'AutoCAD', 'Python'],
    projects: [{ name: 'Go-kart chassis', link: '' }],
    roadmap: '',
    mediaItems: [],
    posts: [
      { type: 'project', text: 'Our SAE team needs one person who knows Arduino. Interested?' },
      { type: 'social', text: 'Workshop on 3D printing next week, seats are limited.' },
    ],
  },
  {
    key: 'tanvi', name: 'Tanvi Rao', year: '1st', branch: 'AI', username: 'tanvi.rao', avatar: 1047,
    bio: 'First year, AI & DS. Learning Python one day at a time.',
    skills: ['Python', 'Machine Learning'],
    projects: [],
    roadmap: '',
    mediaItems: [],
    posts: [
      { type: 'qa', text: 'What should a first-year learn first: C or Python?' },
      { type: 'social', text: 'Found the best chai near campus ☕ — ask me where.' },
    ],
  },
  {
    key: 'dev', name: 'Dev Malhotra', year: '3rd', branch: 'ENTC', username: 'dev.malhotra', avatar: 1048,
    bio: 'Embedded systems and IoT.',
    skills: ['Embedded C', 'IoT', 'PCB Design'],
    projects: [],
    roadmap: '',
    mediaItems: [],
    posts: [
      { type: 'project', text: 'Building an IoT attendance system with RFID, need one web developer.' },
      { type: 'social', text: 'Robotics club demo day is on Saturday!' },
    ],
  },
  {
    key: 'pooja', name: 'Pooja Shinde', year: '3rd', branch: 'CS', username: 'pooja.shinde', avatar: 1050,
    bio: 'Competitive programmer.',
    skills: ['C++', 'DSA'],
    projects: [],
    roadmap: '',
    mediaItems: [],
    posts: [
      { type: 'study', text: 'Codeforces div 3 tonight — who is in?' },
      { type: 'qa', text: 'Segment trees: any beginner-friendly resources?' },
    ],
  },
  {
    key: 'nikhil', name: 'Nikhil Jain', year: '4th', branch: 'IT', username: 'nikhil.jain', avatar: 1062,
    bio: 'Cloud and DevOps. AWS certified.',
    skills: ['AWS', 'Linux', 'Kubernetes', 'CI/CD'],
    projects: [{ name: 'College Fest Website', link: 'https://fest.example.com' }],
    roadmap: '',
    mediaItems: [yt('https://www.youtube.com/watch?v=jNQXAC9IVRw')],
    posts: [
      { type: 'placement', text: 'DevOps internship openings at a Pune startup, referrals possible.' },
      { type: 'study', text: 'Linux commands every engineer should know (my list of 30).' },
    ],
  },
  {
    // Nearly empty profile: no photo, no bio, no skills, no posts (empty states)
    key: 'ishaan', name: 'Ishaan Verma', year: '2nd', branch: 'CS', username: 'ishaan.v',
    bio: '', skills: [], projects: [], roadmap: '', mediaItems: [], posts: [],
  },
];

// The tester's own profile before the Prompt 5 steps (photos are added by the steps themselves)
export const TESTER_PROFILE = {
  name: TESTER.name,
  year: '3rd',
  branch: 'CS',
  bio: 'Third-year CS student. I test MeetNet so you do not have to 🧪',
  skills: ['JavaScript', 'React', 'DSA', 'Git'],
  projects: [{ name: 'Campus Notes', link: 'github.com/meetnet-test/notes' }],
  roadmap: 'Finish the DSA sheet\nBuild two full-stack projects\nApply for summer internships',
  mediaItems: [yt('https://www.youtube.com/watch?v=aqz-KE-bpKQ'), ig('meetnet.tester')],
};

// Relations inside the seed group (tester + base + profile people). Everything else is left alone.
export const FOLLOWS = [
  // the tester
  ['tester', 'riya'], ['tester', 'arjun'], ['arjun', 'tester'], ['tester', 'meera'], ['meera', 'tester'],
  ['nikhil', 'tester'],
  // between the others, so their lists are not empty
  ['meera', 'arjun'], ['arjun', 'meera'], ['riya', 'arjun'], ['kabir', 'arjun'], ['nikhil', 'arjun'],
  ['rohan', 'arjun'], ['arjun', 'riya'], ['ishaan', 'meera'], ['tanvi', 'meera'], ['arjun', 'nikhil'],
];
// [from, to]: `from` asked to follow `to`, still pending
export const REQUESTS = [['kabir', 'tester'], ['rohan', 'tester'], ['tester', 'tanvi'], ['ishaan', 'arjun']];
// [blocker, blocked]
export const BLOCKS = [['tester', 'dev'], ['pooja', 'tester']];

/**
 * mongosh script that puts every follow / request / block between seed-group members back to the
 * lists above. `ids` maps key → user id (hex string).
 */
export function relationsScript(ids) {
  const group = Object.values(ids);
  const edges = { following: {}, followers: {}, sentRequests: {}, pendingRequests: {}, blockedUsers: {} };
  const add = (field, owner, other) => { (edges[field][ids[owner]] ??= []).push(ids[other]); };
  for (const [a, b] of FOLLOWS) { add('following', a, b); add('followers', b, a); }
  for (const [a, b] of REQUESTS) { add('sentRequests', a, b); add('pendingRequests', b, a); }
  for (const [a, b] of BLOCKS) add('blockedUsers', a, b);
  return `
    const group = ${JSON.stringify(group)}.map(id => ObjectId(id));
    const edges = ${JSON.stringify(edges)};
    db.users.updateMany({ _id: { $in: group } }, { $pull: {
      following: { $in: group }, followers: { $in: group }, sentRequests: { $in: group },
      pendingRequests: { $in: group }, blockedUsers: { $in: group } } });
    for (const [field, byOwner] of Object.entries(edges)) {
      for (const [owner, others] of Object.entries(byOwner)) {
        db.users.updateOne({ _id: ObjectId(owner) }, { $addToSet: { [field]: { $each: others.map(id => ObjectId(id)) } } });
      }
    }
    print(JSON.stringify(true));
  `;
}
