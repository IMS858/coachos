/**
 * IMS exercise-selection intent guide.
 * This is a category-level coaching aid, NOT per-exercise safety certification.
 * Source categories/movement patterns come from the canonical workbook.
 * An unknown category must remain "unclassified", not default to "safe".
 */
export type IntentGuide={goal:string;considerWhen:string;verify:string};
const guides:Record<string,IntentGuide>={
 pails_rails_library:{goal:"End-range tissue and neurological capacity with PAILs/RAILs",considerWhen:"An assessment identifies a position-specific passive/active range limitation and the coach has selected the correct joint angle and intent.",verify:"Confirm active vs passive range, irritability, loading direction, setup and clinician restrictions. Never auto-select for flare, post-operative status or undiagnosed pain."},
 pails_rails:{goal:"End-range tissue and neurological capacity",considerWhen:"After joint-specific assessment, when the coach has chosen an indicated end-range strategy.",verify:"Coach verifies direction, tissue tolerance, joint restrictions and technique before dosing."},
 cars_library:{goal:"Articular control and usable range of motion",considerWhen:"Joint-specific active range mapping, warm-up or controlled mobility when appropriate for this client.",verify:"Confirm isolation, pain response and permitted range. No automatic clearance for an injured or postoperative joint."},
 cars:{goal:"Articular control and usable range of motion",considerWhen:"Joint-specific active range mapping, warm-up or controlled mobility when appropriate for this client.",verify:"Confirm isolation, pain response and permitted range. No automatic clearance for an injured or postoperative joint."},
 hip_mobility:{goal:"Hip rotation, flexion or extension control",considerWhen:"Hip assessment reveals a specific movement or control target.",verify:"Check hip diagnosis/restrictions, flexion/rotation tolerance and compensate-at-lumbar risk."},
 foot_ankle_mobility:{goal:"Foot and ankle active range/control",considerWhen:"Ankle or foot assessment identifies a range-of-motion or isolated-control target.",verify:"Check actual ankle/toe joint involved, balance demand and pain response."},
 foot_ankle_strength_balance:{goal:"Distal strength, foot intrinsic function and balance",considerWhen:"Gait, stance or sport demands suggest a foot/ankle strength or balance target.",verify:"Check standing tolerance, support needs, fall risk and tendon/joint loading."},
 knee_mobility_control:{goal:"Knee and tibial active rotation or controlled range",considerWhen:"Assessment shows a specific knee-control target and the movement is indicated.",verify:"Review meniscus/ligament/post-surgical limitations; knee rotational drills require individualized clearance."},
 shoulder_scap_mobility:{goal:"Shoulder and scapular control",considerWhen:"Shoulder assessment identifies scapulothoracic or glenohumeral motor-control limitations.",verify:"Verify whether the exercise loads shoulder, neck and wrist; assess overhead/painful range restrictions."},
 spine_breathing:{goal:"Breathing, trunk coordination or controlled spinal movement",considerWhen:"Coach selects a specific breathing or low-load trunk-control goal.",verify:"Check spine red flags, symptom response and whether the drill involves end-range spinal motion."},
 squat_lunge_step:{goal:"Knee/hip-dominant lower-body strength",considerWhen:"Building squat, lunge, split-stance or step mechanics and capacity within assessed tolerances.",verify:"Check joint depth tolerance, balance, load placement and trunk demand before selecting progression."},
 hinge_bridge_hamstring:{goal:"Hip extension and posterior-chain capacity",considerWhen:"Building hip-hinge technique or hamstring/glute strength for the client's goal.",verify:"Distinguish bridge vs loaded hinge; assess lumbar symptoms, hamstring tolerance, spinal load and technique."},
 core_carry:{goal:"Trunk control and load transfer",considerWhen:"Developing bracing, anti-rotation, gait/carry integration or positional endurance.",verify:"Check spinal and shoulder loading, breath holding, balance and equipment demand."},
 shoulder_accessory:{goal:"Shoulder accessory strength",considerWhen:"Targeting assessed shoulder/scapular strength or control deficits.",verify:"Check symptom-provoking arc, shoulder and elbow load, overhead restrictions and fatigue effects."},
 hip_accessory:{goal:"Hip accessory strength and control",considerWhen:"Targeting an identified hip rotation, abduction, adduction or extension strength goal.",verify:"Check hip joint sensitivity, lumbar compensation and end-range tolerance."},
 horizontal_pull:{goal:"Horizontal pulling strength and scapular control",considerWhen:"Developing upper-back strength and horizontal pulling capacity.",verify:"Check shoulder/elbow tolerance, torso support and spinal loading in the chosen row."},
 vertical_pull:{goal:"Vertical pulling strength",considerWhen:"Developing overhead pulling capacity when shoulder range and control allow.",verify:"Check overhead tolerance, grip, elbow/shoulder restrictions and trunk compensation."},
 horizontal_vertical_push:{goal:"Upper-body pushing strength",considerWhen:"Developing horizontal or vertical pushing capacity in an assessed movement range.",verify:"Distinguish horizontal from overhead mechanics and check shoulder, wrist, elbow and spinal demand."},
 cardio_zone2:{goal:"Aerobic base and sustainable conditioning",considerWhen:"Building aerobic capacity with a tolerated modality and coach-selected intensity.",verify:"Review cardio restrictions, machine exclusions, symptoms and exercise tolerance before dosing."},
 intervals:{goal:"Higher-intensity conditioning",considerWhen:"An appropriate conditioning phase after the client demonstrates the required base and recovery.",verify:"Check cardiovascular screening, contraindications, joint impact, active restrictions and recovery; never default for deconditioned or restricted clients."},
 coach_recovery:{goal:"Recovery or coach-directed low-load work",considerWhen:"The coach explicitly chooses a recovery intervention or lower-load training day.",verify:"Recovery label does not establish safety; review the actual movement, contraindications and equipment."},
 strength_marker_test:{goal:"Technical strength baseline/monitoring",considerWhen:"Coach chooses a repeatable technically controlled measure to guide loading.",verify:"No all-out one-rep maximum by default; review readiness, recent injuries and measurement consistency."},
 assessment:{goal:"Movement assessment",considerWhen:"Coach selects a relevant baseline or reassessment test.",verify:"Follow the test-specific protocol and stop criteria, not generic workout dosing."},
 cardio_test:{goal:"Cardiorespiratory capacity assessment",considerWhen:"A screened client needs a repeatable cardio baseline.",verify:"Confirm testing protocol, medical clearance where indicated, stop rules and modality restrictions."},
};
const patternFallback:Record<string,IntentGuide>={
 mobility:{goal:"Joint-specific active mobility",considerWhen:"Assessment identifies an active range or control goal.",verify:"Determine the actual joints, intensity and clinical restrictions for this exact drill."},
 squat:{goal:"Lower-body squat strength",considerWhen:"Progressing assessed bilateral lower-body mechanics.",verify:"Check hip/knee depth, balance and axial loading."},
 lunge:{goal:"Single-leg lower-body strength",considerWhen:"Progressing assessed split-stance or stepping mechanics.",verify:"Check knee/hip joint demand and balance."},
 hinge:{goal:"Posterior-chain strength",considerWhen:"Progressing assessed hip extension or hinge mechanics.",verify:"Review spine, hip, hamstring and loaded trunk demand."},
 core:{goal:"Trunk control",considerWhen:"Developing a specific bracing or anti-motion target.",verify:"Check loading, breath strategy and spine precautions."},
 foot_ankle:{goal:"Foot/ankle control",considerWhen:"Developing assessed distal movement or strength.",verify:"Check pain, load, support and fall risk."},
 horizontal_pull:{goal:"Pulling strength",considerWhen:"Building assessed upper-body strength.",verify:"Check shoulder, elbow, grip and trunk tolerance."},
 vertical_pull:{goal:"Overhead pulling strength",considerWhen:"Building assessed vertical pulling capacity.",verify:"Check shoulder overhead control, grip and trunk tolerance."},
 horizontal_push:{goal:"Upper-body pushing",considerWhen:"Building assessed horizontal press capacity.",verify:"Check shoulder, elbow and wrist tolerance."},
 vertical_push:{goal:"Overhead pressing",considerWhen:"Building assessed overhead press capacity.",verify:"Check overhead range, lumbar extension and shoulder tolerance."},
 cardio:{goal:"Aerobic conditioning",considerWhen:"Developing aerobic capacity through a selected tolerated modality.",verify:"Check symptoms, cardiac screening and machine restrictions."},
 finisher:{goal:"Conditioning finisher",considerWhen:"Only when session load, capacity and recovery allow.",verify:"Check acute fatigue, joint loading and cardio restrictions."},
 carry:{goal:"Integrated loaded locomotion",considerWhen:"Developing gait, grip and trunk stability with suitable load.",verify:"Check back, shoulder, wrist, balance and breathing demand."},
};
export function exerciseIntent(category:string,pattern:string):IntentGuide|null{
 const categoryKey=category.toLowerCase().replace(/\s*\(.*$/, "").trim();
 return guides[categoryKey]??patternFallback[pattern.toLowerCase().trim()]??null;
}
