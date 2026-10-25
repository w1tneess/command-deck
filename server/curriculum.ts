/**
 * Official CBSE Class 10 Curriculum & NCERT Rationalised Syllabus (2024-25 / 2025-26)
 * Sourced directly from CBSE Academic (https://cbseacademic.nic.in/curriculum_2025.html).
 */

export type OfficialChapter = {
  name: string;
  scope: "unit1" | "unit2" | "pb1" | "pb2" | "board";
  source: string;
};

export const OFFICIAL_CURRICULUM: Record<string, OfficialChapter[]> = {
  maths: [
    { name: "Real Numbers", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Polynomials", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Pair of Linear Equations in Two Variables", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Quadratic Equations", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Arithmetic Progressions", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Triangles", scope: "unit2", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Coordinate Geometry", scope: "unit2", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Introduction to Trigonometry", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Some Applications of Trigonometry", scope: "unit1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Circles", scope: "unit2", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Areas Related to Circles", scope: "unit2", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Surface Areas and Volumes", scope: "unit2", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Statistics", scope: "pb1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
    { name: "Probability", scope: "pb1", source: "CBSE Class 10 Mathematics Standard (Code 041)" },
  ],

  physics: [
    { name: "Light – Reflection and Refraction", scope: "unit1", source: "CBSE Class 10 Science (Code 086) - Natural Phenomena" },
    { name: "The Human Eye and the Colourful World", scope: "unit1", source: "CBSE Class 10 Science (Code 086) - Natural Phenomena" },
    { name: "Electricity", scope: "unit2", source: "CBSE Class 10 Science (Code 086) - Effects of Current" },
    { name: "Magnetic Effects of Electric Current", scope: "pb1", source: "CBSE Class 10 Science (Code 086) - Effects of Current" },
  ],

  chemistry: [
    { name: "Chemical Reactions and Equations", scope: "unit1", source: "CBSE Class 10 Science (Code 086) - Chemical Substances" },
    { name: "Acids, Bases and Salts", scope: "unit1", source: "CBSE Class 10 Science (Code 086) - Chemical Substances" },
    { name: "Metals and Non-metals", scope: "unit2", source: "CBSE Class 10 Science (Code 086) - Chemical Substances" },
    { name: "Carbon and its Compounds", scope: "pb1", source: "CBSE Class 10 Science (Code 086) - Chemical Substances" },
  ],

  biology: [
    { name: "Life Processes", scope: "unit1", source: "CBSE Class 10 Science (Code 086) - World of the Living" },
    { name: "Control and Coordination", scope: "unit1", source: "CBSE Class 10 Science (Code 086) - World of the Living" },
    { name: "How do Organisms Reproduce?", scope: "unit2", source: "CBSE Class 10 Science (Code 086) - World of the Living" },
    { name: "Heredity and Evolution", scope: "pb1", source: "CBSE Class 10 Science (Code 086) - World of the Living" },
    { name: "Our Environment", scope: "pb1", source: "CBSE Class 10 Science (Code 086) - Natural Resources" },
  ],

  history: [
    { name: "The Rise of Nationalism in Europe", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - History" },
    { name: "Nationalism in India", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - History" },
    { name: "The Making of a Global World", scope: "unit2", source: "CBSE Class 10 Social Science (Code 087) - History" },
    { name: "The Age of Industrialisation", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - History" },
    { name: "Print Culture and the Modern World", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - History" },
  ],

  civics: [
    { name: "Power-sharing", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Democratic Politics II" },
    { name: "Federalism", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Democratic Politics II" },
    { name: "Gender, Religion and Caste", scope: "unit2", source: "CBSE Class 10 Social Science (Code 087) - Democratic Politics II" },
    { name: "Political Parties", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - Democratic Politics II" },
    { name: "Outcomes of Democracy", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - Democratic Politics II" },
  ],

  geography: [
    { name: "Resources and Development", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
    { name: "Forest and Wildlife Resources", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
    { name: "Water Resources", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
    { name: "Agriculture", scope: "unit2", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
    { name: "Minerals and Energy Resources", scope: "unit2", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
    { name: "Manufacturing Industries", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
    { name: "Lifelines of National Economy", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - Contemporary India II" },
  ],

  economics: [
    { name: "Development", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Understanding Economic Development" },
    { name: "Sectors of the Indian Economy", scope: "unit1", source: "CBSE Class 10 Social Science (Code 087) - Understanding Economic Development" },
    { name: "Money and Credit", scope: "unit2", source: "CBSE Class 10 Social Science (Code 087) - Understanding Economic Development" },
    { name: "Globalisation and the Indian Economy", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - Understanding Economic Development" },
    { name: "Consumer Rights", scope: "pb1", source: "CBSE Class 10 Social Science (Code 087) - Understanding Economic Development" },
  ],

  english: [
    { name: "A Letter to God", scope: "unit1", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "Nelson Mandela: Long Walk to Freedom", scope: "unit1", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "Two Stories About Flying", scope: "unit1", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "From the Diary of Anne Frank", scope: "unit1", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "Glimpses of India", scope: "unit2", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "Mijbil the Otter", scope: "unit2", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "Madam Rides the Bus", scope: "unit2", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "The Sermon at Benares", scope: "pb1", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "The Proposal (Play)", scope: "pb1", source: "CBSE English (Code 184) - First Flight Prose" },
    { name: "Dust of Snow & Fire and Ice", scope: "unit1", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "A Tiger in the Zoo", scope: "unit1", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "How to Tell Wild Animals", scope: "unit1", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "The Ball Poem", scope: "unit1", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "Amanda!", scope: "unit2", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "The Trees", scope: "unit2", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "Fog", scope: "unit2", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "The Tale of Custard the Dragon", scope: "pb1", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "For Anne Gregory", scope: "pb1", source: "CBSE English (Code 184) - First Flight Poems" },
    { name: "A Triumph of Surgery", scope: "unit1", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "The Thief's Story", scope: "unit1", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "The Midnight Visitor", scope: "unit1", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "A Question of Trust", scope: "unit2", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "Footprints Without Feet", scope: "unit2", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "The Making of a Scientist", scope: "unit2", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "The Necklace", scope: "pb1", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "Bholi", scope: "pb1", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "The Book That Saved the Earth", scope: "pb1", source: "CBSE English (Code 184) - Footprints Without Feet" },
    { name: "Reading Comprehension & Analytical Paragraph", scope: "unit1", source: "CBSE English (Code 184) - Writing & Grammar" },
  ],

  bengali: [
    { name: "Gyanchakshu (জ্ঞানচক্ষু)", scope: "unit1", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Gadya" },
    { name: "Alobabu (আলোবাবু)", scope: "unit1", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Gadya" },
    { name: "Adal Bodol (আদল বদল)", scope: "unit2", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Gadya" },
    { name: "Bohurupi (বহুরূপী)", scope: "pb1", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Gadya" },
    { name: "Tinpaharer Kole (তিনপাহাড়ের কোলে)", scope: "unit1", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Padya" },
    { name: "Aay Aro Bendhe Bendhe Thaki (আয় আরো বেঁধে বেঁধে থাকি)", scope: "unit1", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Padya" },
    { name: "Ekakare (একাকারে)", scope: "unit2", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Padya" },
    { name: "Astrer Biruddhe Gaan (অস্ত্রের বিরুদ্ধে গান)", scope: "pb1", source: "CBSE Bengali (Code 005) - Sahitya Sanchayan Padya" },
    { name: "Postmaster (পোস্টমাস্টার)", scope: "unit1", source: "CBSE Bengali (Code 005) - Golpoguccha" },
    { name: "Kabuliwala (কাবুলিওয়ালা)", scope: "unit2", source: "CBSE Bengali (Code 005) - Golpoguccha" },
    { name: "Daan Pratidaan (দান প্রতিদান)", scope: "pb1", source: "CBSE Bengali (Code 005) - Golpoguccha" },
    { name: "Sandhi: Byanjan & Bisarga (সন্ধি)", scope: "unit1", source: "CBSE Bengali (Code 005) - Byakaran" },
    { name: "Samas: Dwandwa, Karmadharay, Abyayibhab (সমাস)", scope: "unit2", source: "CBSE Bengali (Code 005) - Byakaran" },
    { name: "Bakya Paribartan: Saral, Jotil, Jougik (বাক্য পরিবর্তন)", scope: "pb1", source: "CBSE Bengali (Code 005) - Byakaran" },
    { name: "Sadhu O Chalit Bhasha & Letter Writing", scope: "pb1", source: "CBSE Bengali (Code 005) - Nirmithi" },
  ],

  it: [
    { name: "Communication Skills-II", scope: "unit1", source: "CBSE IT (Code 402) - Employability Skills" },
    { name: "Self-Management Skills-II", scope: "unit1", source: "CBSE IT (Code 402) - Employability Skills" },
    { name: "ICT Skills-II", scope: "unit2", source: "CBSE IT (Code 402) - Employability Skills" },
    { name: "Entrepreneurial Skills-II", scope: "pb1", source: "CBSE IT (Code 402) - Employability Skills" },
    { name: "Green Skills-II", scope: "pb1", source: "CBSE IT (Code 402) - Employability Skills" },
    { name: "Digital Documentation (Advanced) - LibreOffice Writer", scope: "unit1", source: "CBSE IT (Code 402) - Subject Specific Skills" },
    { name: "Electronic Spreadsheet (Advanced) - LibreOffice Calc", scope: "unit2", source: "CBSE IT (Code 402) - Subject Specific Skills" },
    { name: "Database Management System - LibreOffice Base", scope: "pb1", source: "CBSE IT (Code 402) - Subject Specific Skills" },
    { name: "Maintain Healthy, Safe and Secure Working Environment", scope: "pb1", source: "CBSE IT (Code 402) - Subject Specific Skills" },
  ],
};
