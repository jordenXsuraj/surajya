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
  // Prompt 6 (Connect): one more follow request for the tester, people the Suggested tab ranks
  // high for the tester (3rd yr CS; shared skills), and two students at other colleges for the
  // all-colleges search
  {
    key: 'sana', name: 'Sana Shaikh', year: '4th', branch: 'IT', username: 'sana.shaikh', avatar: 1076,
    bio: 'Placement cell volunteer. Ask me about aptitude rounds.',
    skills: ['Java', 'Spring Boot', 'SQL'], projects: [], roadmap: '', mediaItems: [],
    posts: [{ type: 'placement', text: 'Aptitude practice group every Tuesday 6 pm in the seminar hall.' }],
  },
  {
    key: 'aditi', name: 'Aditi Kulkarni', year: '3rd', branch: 'CS', username: 'aditi.k', avatar: 1082,
    bio: 'Frontend + DSA. Building a study planner app.',
    skills: ['React', 'DSA', 'JavaScript', 'Figma'], projects: [{ name: 'Study Planner', link: '' }],
    roadmap: '', mediaItems: [],
    posts: [{ type: 'study', text: 'My React hooks cheat sheet, happy to share with anyone preparing.' }],
  },
  {
    key: 'varun', name: 'Varun Mehta', year: '3rd', branch: 'CS', username: 'varun.codes',
    bio: 'ML enthusiast.', skills: ['C++', 'Python', 'Machine Learning'], projects: [], roadmap: '',
    mediaItems: [], posts: [],
  },
  {
    key: 'kunal', name: 'Kunal Rao', year: '2nd', branch: 'ENTC', username: 'kunal.rao', avatar: 1036,
    college: 'Pune Institute of Computer Technology (PICT)',
    bio: 'Robotics club, PICT.', skills: ['Embedded C', 'IoT', 'Python'], projects: [], roadmap: '',
    mediaItems: [],
    posts: [{ type: 'social', text: 'PICT robotics expo this weekend, everyone is welcome!' }],
  },
  {
    key: 'neha', name: 'Neha Iyer', year: '4th', branch: 'CS', username: 'neha.iyer', avatar: 1060,
    college: 'College of Engineering Pune (COEP)',
    bio: 'SDE intern, COEP.', skills: ['React', 'Node.js', 'DSA'], projects: [], roadmap: '',
    mediaItems: [],
    posts: [{ type: 'placement', text: 'COEP mock interview drive next week, DM for the form.' }],
  },
];

/** The tester's own posts (created once): they receive the likes / replies / interest below. */
export const TESTER_POSTS = [
  { key: 'tester-dsa', type: 'social', daysAgo: 1,
    text: 'Finished my DSA sheet today 🎉 Who wants to start the next one together?' },
  { key: 'tester-project', type: 'project', daysAgo: 3,
    text: 'Looking for one teammate for Campus Notes v2 (React Native + Node).' },
];
/** Arjun's placement post (from PROFILE_PEOPLE) for the new_post notification. */
export const ARJUN_POST_TEXT = PROFILE_PEOPLE[0].posts[0].text;

// The tester's notifications: every type, read and unread, Today / This week / Earlier.
// Messages are the server's (server/routes/users.js, posts.js, routes calling notifyFollowers).
export const NOTIFICATIONS = [
  { type: 'connection_request', from: 'sana', hoursAgo: 1, read: false },
  { type: 'post_liked', from: 'arjun', post: 'tester-dsa', hoursAgo: 2, read: false },
  { type: 'connection_request', from: 'rohan', hoursAgo: 3, read: false },
  { type: 'post_replied', from: 'meera', post: 'tester-dsa', hoursAgo: 6, read: false },
  { type: 'interested', from: 'riya', post: 'tester-project', hoursAgo: 48, read: false },
  { type: 'connection_accepted', from: 'arjun', hoursAgo: 96, read: true },
  { type: 'connection_request', from: 'kabir', hoursAgo: 120, read: true },
  { type: 'new_post', from: 'arjun', post: 'arjun-placement', hoursAgo: 12 * 24, read: true },
  { type: 'post_liked', from: 'nikhil', post: 'tester-project', hoursAgo: 20 * 24, read: true },
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
export const REQUESTS = [
  ['kabir', 'tester'], ['rohan', 'tester'], ['sana', 'tester'], ['tester', 'tanvi'], ['ishaan', 'arjun'],
];
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

const PEOPLE_BY_KEY = Object.fromEntries([...BASE_PEOPLE, ...PROFILE_PEOPLE].map((p) => [p.key, p]));
const POST_TYPE = { 'tester-dsa': 'social', 'tester-project': 'project', 'arjun-placement': 'placement' };

/** The text the server writes for each notification type (same templates). */
function notificationMessage({ type, from, post }) {
  const p = PEOPLE_BY_KEY[from];
  switch (type) {
    case 'connection_request': return `${p.name} wants to follow you`;
    case 'connection_accepted': return `${p.name} accepted your follow request`;
    case 'post_replied': return `${p.name} replied to your post`;
    case 'post_liked': return `${p.name} liked your post`;
    case 'interested': return `${p.name} (${p.year} yr ${p.branch}) is interested in your ${POST_TYPE[post]} post`;
    case 'new_post': return `${p.name} shared a new ${POST_TYPE[post]} post`;
    default: throw new Error(`unknown notification type ${type}`);
  }
}

/**
 * mongosh script that replaces the tester's notifications with NOTIFICATIONS. `ids` maps key → user
 * id; `postIds` maps tester-dsa / tester-project / arjun-placement → post id.
 */
export function notificationsScript(ids, postIds, now = Date.now()) {
  // The app groups by the phone's calendar day: the "today" ones stay today even shortly after
  // midnight (in their order), everything else keeps its age
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const docs = NOTIFICATIONS.map((n) => ({
    sender: ids[n.from],
    type: n.type,
    post: n.post ? postIds[n.post] : null,
    message: notificationMessage(n),
    read: n.read,
    at: n.hoursAgo < 24
      ? Math.max(now - n.hoursAgo * 3600000, midnight.getTime() + (24 - n.hoursAgo) * 60000)
      : now - n.hoursAgo * 3600000,
  }));
  return `
    const tester = ObjectId(${JSON.stringify(ids.tester)});
    db.notifications.deleteMany({ recipient: tester });
    const docs = ${JSON.stringify(docs)};
    db.notifications.insertMany(docs.map(d => ({ recipient: tester, sender: ObjectId(d.sender), type: d.type,
      post: d.post ? ObjectId(d.post) : null, message: d.message, read: d.read, createdAt: new Date(d.at) })));
    print(JSON.stringify(docs.length));
  `;
}

/**
 * Connect → Find people loads 20 students at a time: these first-year fillers (no photo, no
 * posts, oldest accounts) put the campus list on two pages, "Batch Student 01" last of all.
 */
export const FILLER_PEOPLE = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { key: `batch${n}`, name: `Batch Student ${n}`, year: '1st', branch: 'Other' };
});

/** Unread notifications in the seed (the bell and the Activity badge start from these). */
export const SEED_UNREAD = NOTIFICATIONS.filter((n) => !n.read).length;
