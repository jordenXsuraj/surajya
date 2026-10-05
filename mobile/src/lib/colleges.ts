// From nexusnetwork/src/pages/Onboard.jsx (COLLEGES), same order, with surrounding whitespace
// trimmed and the exact duplicate "IIT Bombay" entry removed. The server trims colleges and
// matches them case-insensitively, so stored values are unchanged.

const RAW = [
  // Maharashtra — Pune
  'Sinhgad Academy of Engineering, Pune',
  'Sinhgad College of Engineering, Pune',
  'Sinhgad Institute of Technology, Lonavala',
  'Sinhgad Institute of Technology and Science, Pune',
  'Sinhgad Technical Education Society, Pune',
  'Smt. Kashibai Navale College of Pharmacy (SKNCOP)',
  'Sinhgad College of Pharmacy, Vadgaon (Bk.), Pune',
  'Sinhgad Institute of Pharmacy, Narhe, Pune',
  'Sinhgad Institute of Pharmaceutical Sciences, Lonavala',
  'Yashoda Technical Campus, Satara (YSPM)',
  'College of Engineering Pune (COEP)',
  'Pune Institute of Computer Technology (PICT)',
  'Vishwakarma Institute of Technology (VIT Pune)',
  'Vishwakarma Institute of Information Technology (VIIT)',
  'Cummins College of Engineering for Women, Pune',
  'MIT College of Engineering, Pune',
  'Symbiosis Institute of Technology (SIT), Pune',
  'Indira College of Engineering and Management, Pune',
  'Pimpri Chinchwad College of Engineering (PCCOE)',
  'Dr. D.Y. Patil Institute of Technology, Pune',
  'JSPM Narhe Technical Campus, Pune',
  'JSPM Imperial College of Engineering, Pune',
  'Bharati Vidyapeeth College of Engineering, Pune',
  'Army Institute of Technology (AIT), Pune',
  'Zeal College of Engineering and Research, Pune',
  'G.H. Raisoni College of Engineering, Pune',
  'Nutan Maharashtra Institute of Engineering and Technology (NMIET)',
  'Modern College of Engineering, Pune',
  'NBN Sinhgad School of Engineering, Pune',
  'Smt. Kashibai Navale College of Engineering, Pune',
  'SKN Sinhgad College of Engineering, Korti Pandharpur',
  'SKN Sinhgad Institute of Technology and Science, Lonavala',
  // Maharashtra — Mumbai
  'Indian Institute of Technology Bombay (IIT Bombay)',
  'Veermata Jijabai Technological Institute (VJTI)',
  'K.J. Somaiya College of Engineering, Mumbai',
  'Sardar Patel College of Engineering (SPCE), Mumbai',
  'Shah and Anchor Kutchhi Engineering College, Mumbai',
  'Thadomal Shahani Engineering College, Mumbai',
  'Dwarkadas J. Sanghvi College of Engineering, Mumbai',
  'Fr. Conceicao Rodrigues College of Engineering, Mumbai',
  'University of Mumbai',
  'NMIMS Mukesh Patel School of Technology, Mumbai',
  // Maharashtra — Nashik / Aurangabad / Nagpur
  'K.K. Wagh Institute of Engineering Education and Research, Nashik',
  'Sandip Institute of Technology and Research Centre, Nashik',
  'Government College of Engineering, Aurangabad',
  'MGM College of Engineering, Aurangabad',
  'Visvesvaraya National Institute of Technology (VNIT), Nagpur',
  'Yeshwantrao Chavan College of Engineering (YCCE), Nagpur',
  'G.H. Raisoni College of Engineering, Nagpur',
  // Karnataka
  'Indian Institute of Technology Dharwad',
  'National Institute of Technology Karnataka (NITK), Surathkal',
  'R.V. College of Engineering, Bangalore',
  'M.S. Ramaiah Institute of Technology, Bangalore',
  'BMS College of Engineering, Bangalore',
  'PES University, Bangalore',
  'Dayananda Sagar College of Engineering, Bangalore',
  // Delhi / NCR
  'Indian Institute of Technology Delhi (IIT Delhi)',
  'Delhi Technological University (DTU)',
  'Netaji Subhas University of Technology (NSUT)',
  'Indraprastha Institute of Information Technology Delhi (IIIT Delhi)',
  'Jamia Millia Islamia, Delhi',
  // Tamil Nadu
  'Indian Institute of Technology Madras (IIT Madras)',
  'Anna University, Chennai',
  'PSG College of Technology, Coimbatore',
  'Amrita School of Engineering, Coimbatore',
  'Sri Sivasubramaniya Nadar College of Engineering, Chennai',
  // Other IITs / NITs
  'Indian Institute of Technology Kharagpur (IIT KGP)',
  'Indian Institute of Technology Bombay (IIT Bombay)',
  'Indian Institute of Technology Kanpur (IIT Kanpur)',
  'Indian Institute of Technology Roorkee (IIT Roorkee)',
  'Indian Institute of Technology Hyderabad (IIT Hyderabad)',
  'Indian Institute of Technology Indore (IIT Indore)',
  'National Institute of Technology Trichy (NIT Trichy)',
  'National Institute of Technology Warangal (NIT Warangal)',
  'National Institute of Technology Calicut (NIT Calicut)',
  // D. Y. Patil
  'D. Y. Patil College of Engineering and Innovation, Varale, Talegaon, Pune (DYPCOEI)',
  'Dr. D Y Patil Technical Campus , Talegaon, Pune',
  'Ajeenkya D.Y. Patil University (Lohegaon) , Pune',
  'D.Y. Patil College of Engineering, Akurdi (DYPCOE)',
  'Dr. D.Y. Patil Institute of Technology, Pimpri (DIT)',
  'Indira College of Engineering & Management, Pune (ICEM)',
  'Marathwada Mitra Mandals College of Engineering (MMCOE), Karvenagar',
  'MM,s Institute of Management Education Research & Training (IMERT)',
  'Pimpri Chinchwad College Of Engineering (PCCOE)',
  'Pimpri Chinchwad College of Engineering and Research, Ravet(PCCoER)',
];

export const COLLEGES: readonly string[] = [...new Set(RAW.map((c) => c.trim()))];

export const MAX_COLLEGE_SUGGESTIONS = 6;

/** Web CollegeInput: 2+ characters, case-insensitive "contains", at most 6. */
export function suggestColleges(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return COLLEGES.filter((c) => c.toLowerCase().includes(q)).slice(0, MAX_COLLEGE_SUGGESTIONS);
}
