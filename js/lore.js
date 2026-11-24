// THE WATCHING DARK - notes found in the world
'use strict';

const Lore = {
    level1: [
        {
            title: "RESEARCHER'S LOG - FINAL ENTRY",
            date: 'Date: [REDACTED]',
            html: `
                <p>If you're reading this, you're already being watched.</p>
                <p>They call them "The Watchers" - entities that exist in darkness. I've studied them for months, and I've learned their nature:</p>
                <p><strong>They freeze when observed.</strong> Look directly at them and they become statues. But the moment you blink, the moment you look away... they move. Silent. Swift. Deadly.</p>
                <p><strong>They fear the flame.</strong> Light a match near them and they flee in terror. The fire reminds them of something ancient, something that hurt them long ago.</p>
                <p><strong>You will hear them coming.</strong> Their footsteps echo through these halls - louder than yours, heavier than yours. When you hear them close, you have seconds to decide: look, or run.</p>
                <p>If you want to survive, remember: <em>Don't blink. Don't turn your back. And whatever you do, don't let them get close.</em></p>
                <p class="note-signature">- Dr. [ILLEGIBLE]</p>`
        },
        {
            title: 'MAINTENANCE WORK ORDER #4471',
            date: 'Priority: URGENT (again)',
            html: `
                <p>Third request this week. The lamps in Halls C through F keep failing. Bulbs are fine. Wiring is fine. They just <strong>go out</strong>.</p>
                <p>Night crew reports "figures" standing in the corridors when the lights come back. Mannequins, they say. We don't have any mannequins.</p>
                <p>Kowalski swears one of them was closer every time the bulb flickered.</p>
                <p>Kowalski did not come in for his shift today.</p>
                <p><em>Please send someone. Please send someone who isn't us.</em></p>
                <p class="note-signature">- Facilities, Sub-Level 1</p>`
        },
        {
            title: 'DR. SHAW - OBSERVATION 12',
            date: 'Containment Wing, Week 6',
            html: `
                <p>Confirmed: the subjects do not move while observed. Not slowly. <strong>Not at all.</strong> Their joints do not even settle.</p>
                <p>Line of sight is all that matters. A wall breaks it. A corner breaks it. Turning your head breaks it.</p>
                <p>They hunt by sound as well as sight. Running is the worst thing you can do, and it is the first thing everyone does.</p>
                <p>Unrelated, perhaps: the security cameras on Sub-Level 4 recorded movement in an empty room last night. Something the guards could not see on the floor, but the tape could.</p>
                <p>Marsh says it is a fault in the tape. I hope she is right.</p>
                <p class="note-signature">- Dr. A. Shaw</p>`
        },
        {
            title: "NIGHT GUARD'S NOTEBOOK",
            date: 'Torn out, folded twice',
            html: `
                <p>I count them every night. That is the job now. Walk Hall C and count the statues.</p>
                <p>Monday: fourteen.<br>Tuesday: fourteen.<br>Wednesday: fourteen.</p>
                <p>Thursday: fifteen.</p>
                <p>I didn't look away from the new one the whole walk back. My eyes were streaming. When I reached the door I realised I'd stopped counting the others.</p>
                <p><strong>Keep your light on them. Walk backwards if you have to.</strong></p>`
        },
        {
            title: 'MEMO: FIRE SAFETY (REVISED)',
            date: 'From: Site Director',
            html: `
                <p>Effective immediately, all personnel will carry matches at all times.</p>
                <p>Flashlights fail. Generators fail. <strong>Fire does not.</strong></p>
                <p>When struck, a match will cause any subject within a short distance to retreat. Do not waste them. Do not strike two at once. Do not attempt to "chase them off" - they come back angrier.</p>
                <p>The emergency exits are marked in green. They are the only doors on this level that lead anywhere.</p>
                <p class="note-signature">- Management</p>`
        },
        {
            title: 'SCRAWLED ON A RECEIPT',
            date: 'Handwriting gets worse toward the end',
            html: `
                <p>green door green door green door</p>
                <p>the green ones are real. the map is real. trust the map</p>
                <p>heard singing under the floor. wet singing. there's a basement under the basement and the pumps stopped a week ago</p>
                <p>whatever is down there CAN'T SEE. I watched one walk into a wall. but when I dropped my keys it turned and came straight for me</p>
                <p><em>don't go down. if you go down, go quiet.</em></p>`
        }
    ],
    level2: [
        {
            title: 'SANCTUARY LOG - ASCENSION RECORD',
            date: 'Location: The Eternal Gardens',
            html: `
                <p>You've escaped the darkness. But light can be just as dangerous.</p>
                <p>Welcome to the realm of <strong>The Angels</strong> - beings of pure radiance. But do not let their beauty deceive you.</p>
                <p><strong>They are drawn to attention.</strong> The Angels MOVE when you look at them. Your gaze awakens them. The longer you stare, the faster they charge toward you with terrible purpose.</p>
                <p><strong>They freeze when ignored.</strong> Look away and they become statues of light, harmless and still. But turn your eyes back and their hunt resumes with even greater fervor.</p>
                <p><strong>They build momentum.</strong> The more you watch them, the more power they gain. Their charge accelerates. Their wings beat faster. Soon they will be upon you.</p>
                <p>This is the inverse of what you knew. <em>Here, to look is to invite doom. To ignore is to survive. Keep moving. Never stare too long.</em></p>
                <p class="note-signature">- Keeper of the Light</p>`
        },
        {
            title: "DR. HELENA'S JOURNAL - DAY 1",
            date: 'The First Discovery',
            html: `
                <p>I found it. After months of research, I finally understand what happened in the dark facility.</p>
                <p>The creatures there - the "Watchers" - they weren't born in darkness. They <strong>fled</strong> into it.</p>
                <p>My colleague Dr. Shaw was right. The shadows fear light not because it hurts them, but because of what dwells IN the light.</p>
                <p>I'm following the trail they left. There's a place they call "The Eternal Garden." The shadows whisper about it in terror.</p>
                <p>Tomorrow, I enter the forest. God help me.</p>
                <p class="note-signature">- Dr. Helena Marsh, Paranormal Research Division</p>`
        },
        {
            title: "DR. HELENA'S JOURNAL - DAY 3",
            date: 'The Angels',
            html: `
                <p>I was wrong. So terribly wrong.</p>
                <p>The entities here are not guardians. They're <strong>hunters</strong>. Beautiful. Luminous. Deadly.</p>
                <p>My research assistant, Marcus, looked at one for too long. It... changed. Its eyes ignited with golden fire.</p>
                <p>It didn't freeze like the shadows do. It CHARGED. Faster and faster the longer he stared.</p>
                <p>I pulled him behind a tree. The Angel stopped moving the moment we broke eye contact.</p>
                <p>Marcus is gone now. He ran. I heard him scream.</p>
                <p><em>Never stare. Never let them see you watching.</em></p>
                <p class="note-signature">- Dr. Helena Marsh</p>`
        },
        {
            title: 'ANCIENT TABLET TRANSLATION',
            date: 'Age Unknown',
            html: `
                <p>"In the time before time, there was only the Light Eternal."</p>
                <p>"The First Beings were born of radiance - perfect, unwavering, absolute."</p>
                <p>"But perfection cannot tolerate imperfection. The shadows that danced at their feet grew conscious, grew willful."</p>
                <p>"The First Beings - the Angels - declared war. All shadow must be purged."</p>
                <p>"The shadows learned to mimic their hunters. To freeze when seen. To move unseen."</p>
                <p>"They scattered into the void, creating the Dark Places as sanctuary."</p>
                <p><strong>"The war never ended. It merely split into two fronts: Light and Dark."</strong></p>
                <p class="note-signature">- Translated from Pre-Human Script</p>`
        },
        {
            title: "DR. HELENA'S JOURNAL - DAY 7",
            date: 'The Pattern',
            html: `
                <p>I've survived by understanding the pattern.</p>
                <p>The Angels <strong>feed on attention</strong>. Your gaze is their sustenance. The more you look, the stronger they become.</p>
                <p>I watched one charge a deer today. The animal couldn't look away - animals don't understand. The Angel accelerated until it was a blur of light.</p>
                <p>It's the opposite of everything we learned about the shadows. The shadows move when unwatched. The Angels move when watched.</p>
                <p>This is their revenge. The shadows copied the Angels' weakness to escape. So the Angels inverted it, weaponized it.</p>
                <p><em>I'm running out of food. The exit must be close.</em></p>
                <p class="note-signature">- Dr. Helena Marsh</p>`
        },
        {
            title: "SURVIVOR'S WARNING",
            date: 'Left by Someone Who Escaped',
            html: `
                <p>YOU CAN MAKE IT OUT.</p>
                <p>I did. Barely. Here's what you need to know:</p>
                <p><strong>1. Peripheral vision is your friend.</strong> You can see Angels without looking AT them. Navigate by what you see at the edge of your vision.</p>
                <p><strong>2. Quick glances only.</strong> If you must look directly at one, make it brief. One second maximum.</p>
                <p><strong>3. They build momentum.</strong> An Angel you've stared at for a few seconds is four times faster than one you just glanced at.</p>
                <p><strong>4. The golden relics slow them.</strong> Carry the light and they falter.</p>
                <p>The golden glow ahead is the exit. I marked it for you.</p>
                <p>Don't give up. Don't panic. <em>And whatever you do, don't stare.</em></p>
                <p class="note-signature">- Someone who made it</p>`
        },
        {
            title: "DR. HELENA'S JOURNAL - FINAL ENTRY",
            date: 'Day 12',
            html: `
                <p>I see the exit. Golden light, just like the tablets said.</p>
                <p>But I understand now. There is no escape. Not really.</p>
                <p>The shadows in the dark. The Angels in the light. Both hunting. Both eternal.</p>
                <p>We thought we could study them, contain them, understand them. But they're not subjects. They're forces of nature.</p>
                <p><strong>Whoever reads this: RUN. Don't look back. Not at the shadows. Not at the Angels.</strong></p>
                <p>The exit is ahead. I'm going through. Maybe I'll find peace. Maybe just another nightmare.</p>
                <p>If I don't make it... tell my daughter I tried.</p>
                <p class="note-signature">- Dr. Helena Marsh, final words</p>`
        }
    ],
    level3: [
        {
            title: 'RESERVOIR CONTROL - INCIDENT REPORT',
            date: 'Sub-Level B3 · Pumps offline',
            html: `
                <p>The golden light does not lead out. It leads <strong>down</strong>. If you are reading this, you fell through the same way we did.</p>
                <p>The pumps failed eleven days ago and B3 flooded. The holding tanks cracked. The subjects we kept in them are loose in the water now.</p>
                <p><strong>They are blind.</strong> They were born in the tanks and never saw light. Your flashlight means nothing to them.</p>
                <p><strong>They hear everything.</strong> Footsteps. Splashing. A match being struck. Walking draws the ones nearby; running draws them all.</p>
                <p>Crouch <kbd>C</kbd> and move slowly - they can pass right beside you and never know. The dark pools are deep: wading through them is slow and <em>loud</em>.</p>
                <p>Listen for the clicking. That is how they look for you.</p>
                <p class="note-signature">- Reservoir Control</p>`
        },
        {
            title: "DIVER'S LOG",
            date: 'Intake tunnel 2',
            html: `
                <p>Went down to clear the intake grate. Visibility zero. Hand on the guide rope the whole way.</p>
                <p>Something took hold of the other end of the rope and held it very still.</p>
                <p>I held still too. Must have been ten minutes. My lungs were screaming. Eventually it let go and drifted off, clicking.</p>
                <p>It never knew I was there. <strong>It only knew the rope had moved.</strong></p>
                <p class="note-signature">- R. Okafor</p>`
        },
        {
            title: 'DR. SHAW - TANK NOTES',
            date: 'Subject series D',
            html: `
                <p>Series D were never exposed to light. Within two generations the eyes had sealed over completely.</p>
                <p>Their hearing compensated beyond anything we predicted. One of them turned toward my heartbeat through four inches of glass.</p>
                <p>Marsh thinks they are what the Watchers become when there is nothing left to watch. I think she's being poetic.</p>
                <p>I have started whispering in the tank room. I don't know when that started.</p>
                <p class="note-signature">- Dr. A. Shaw</p>`
        },
        {
            title: 'PUMP STATION - STICKY NOTE',
            date: 'Stuck to a valve wheel',
            html: `
                <p><strong>IF YOU HEAR CLICKING - FREEZE.</strong></p>
                <p>They click and listen for the echo. Anything that moves after a click gets found.</p>
                <p>Count to five after the clicks stop. Then move. Slowly.</p>
                <p>Don't light anything near them. The strike is the loudest sound you'll make down here.</p>`
        },
        {
            title: 'ELLIE MARSH - VOICE MEMO (TRANSCRIBED)',
            date: 'Recovered from a waterproof case',
            html: `
                <p>My name is Ellie Marsh. My mother is Dr. Helena Marsh. She came here two years ago and stopped writing.</p>
                <p>They told me the facility was decommissioned. Then why is the power still on upstairs? Why are there fresh footprints in the mud?</p>
                <p>I found her journal in the garden. The last page said she went into the light.</p>
                <p>I went in after her. I'm in water up to my knees and something is clicking in the dark and I can't stop shaking.</p>
                <p><em>Mum, if you're down here, stay quiet. I'm coming.</em></p>`
        },
        {
            title: 'EVACUATION NOTICE',
            date: 'Posted beside the stairwell',
            html: `
                <p>ALL STAFF: proceed to the stairwell exits (green) and climb to the <strong>Observation Wing</strong>.</p>
                <p>Do NOT use the elevators. Do NOT wade through the flooded storage bays.</p>
                <p>Observation Wing staff will issue you a camera on arrival. Do not lose it. Do not lower it.</p>
                <p>You will understand why when you get there.</p>`
        }
    ],
    level4: [
        {
            title: 'CAMERA PROTOCOL - OBSERVATION WING',
            date: 'Read before entering',
            html: `
                <p>The entities on this wing do not reflect visible light. <strong>You cannot see them with your eyes.</strong> They exist only on film.</p>
                <p>Raise the camcorder (hold <kbd>RIGHT MOUSE</kbd> or press <kbd>Q</kbd>). Through the night-vision lens you will see them - pale, still and very close.</p>
                <p><strong>While they are on camera, they cannot move.</strong> The moment you lower it, they can. Keep them in frame and back away.</p>
                <p>The camera drains its battery while raised. Spare cells are stocked around the wing.</p>
                <p>If you hear static, one of them is near. <em>Raise the camera.</em></p>
                <p class="note-signature">- Observation Wing Supervisor</p>`
        },
        {
            title: 'TAPE 07 - TRANSCRIPT',
            date: 'Corridor 4, 02:14',
            html: `
                <p>[00:00] Okay, recording. Corridor four. There's nothing here. Again.</p>
                <p>[00:41] I'm going to put the camera down on the desk and just talk for a minute.</p>
                <p>[01:12] [Camera faces the corridor. The researcher is visible, back to the lens.]</p>
                <p>[01:13] [A pale figure is standing directly behind him.]</p>
                <p>[01:58] [It is closer.]</p>
                <p>[02:30] [Tape ends.]</p>`
        },
        {
            title: 'DR. SHAW - ON OBSERVATION',
            date: 'Unsent letter',
            html: `
                <p>Helena - the Watchers freeze when they are seen. The Angels hunt when they are seen. These ones exist <strong>only</strong> when they are seen.</p>
                <p>I don't believe we are dealing with three species. I think it is one thing, seen from three sides.</p>
                <p>Something that wants to be looked at. Something that is <em>looking back</em>.</p>
                <p>I've stopped sleeping. When I close my eyes I can feel it watching through the lids.</p>
                <p class="note-signature">- A.</p>`
        },
        {
            title: 'SECURITY LOG',
            date: 'Monitor bank B',
            html: `
                <p>23:10 - Camera 4 shows six people in the break room. Break room is empty. I checked twice.</p>
                <p>23:40 - Seven people.</p>
                <p>23:55 - All seven are facing the camera.</p>
                <p>00:20 - Camera 4 is now showing the security office. I am in the security office.</p>
                <p><strong>I am not going to turn around.</strong></p>`
        },
        {
            title: 'ELLIE MARSH - NOTEBOOK',
            date: 'Day 4',
            html: `
                <p>Got out of the water. Found a camcorder on a dead man's desk. The battery was full. That scares me more than anything.</p>
                <p>Through the lens there are dozens of them. Standing in doorways. Standing in corners. Standing in the middle of the room I was sitting in.</p>
                <p>When I lower the camera I hear them breathe. It sounds like static.</p>
                <p>Mum's handwriting is on the wall outside the exit stairs. Just one word: <strong>DOWN</strong>.</p>`
        },
        {
            title: 'PINNED TO A MONITOR',
            date: 'In red marker',
            html: `
                <p>BATTERY IS LIFE</p>
                <p>don't film the empty halls. film the CORNERS. that's where they wait</p>
                <p>if the picture starts tearing it's right in front of you</p>
                <p><em>never lower it when you hear static</em></p>`
        }
    ],
    level5: [
        {
            title: 'THE LAST PAGE',
            date: 'Written on the back of a photograph',
            html: `
                <p>This is the bottom. This is where they all came from.</p>
                <p>Almost none of them are left down here. They climbed - up through the water, into the halls, into the garden. <strong>They were running away from this place.</strong></p>
                <p>The walls are breathing. I can feel a heartbeat through my shoes. It gets faster the further down I go.</p>
                <p>There are eyes in the flesh. They stare at me, and when I turn to look they roll back white. If I stand still I can hear them move.</p>
                <p>Keep your light on. Don't let the arms touch you. Don't follow the woman.</p>
                <p>And <em>do not look up for long</em>.</p>
                <p class="note-signature">- E.M.</p>`
        },
        {
            title: 'DR. SHAW - FINAL THEORY',
            date: 'Pages stuck together with something dark',
            html: `
                <p>It is an eye. It was always an eye.</p>
                <p>Everything we found - the shadows, the Angels, the blind things, the ones on film - they are its gaze, broken into pieces and set loose to hunt.</p>
                <p>It does not want to kill us. It wants to be <strong>seen</strong>. Every person who looks at it becomes part of what it sees with.</p>
                <p>I looked. Only for a second. I can see the maze from above now, even with my eyes closed.</p>
                <p class="note-signature">- A. Shaw</p>`
        },
        {
            title: 'HELENA MARSH',
            date: 'Scratched into the stone',
            html: `
                <p>Ellie,</p>
                <p>If you have come this far then you are braver than I ever was, and more stubborn, and I am so sorry.</p>
                <p>I am still here. I am in the walls and the light and the dark. It doesn't hurt. It's just <em>watching</em>, forever.</p>
                <p>The light at the heart of the maze is real. I couldn't reach it. <strong>You can.</strong></p>
                <p>Don't look up. Don't look back. I love you.</p>
                <p class="note-signature">- Mum</p>`
        },
        {
            title: 'ELLIE MARSH - LAST ENTRY',
            date: 'No date. The ink is still wet.',
            html: `
                <p>Found her words in the stone. Found her handprints. Didn't find her.</p>
                <p>The Angels came for me in the long hall. I stared at the Watchers until my eyes bled and kept the halos in the corner of my vision.</p>
                <p>The eye opened above me and I looked. Just for a moment. Now I can hear it thinking.</p>
                <p>If someone finds this - finish it. <strong>Reach the light.</strong> Don't become another thing it sees with.</p>`
        },
        {
            title: 'UNSIGNED',
            date: 'Written in the dust',
            html: `
                <p>IT IS NOT WATCHING YOU.</p>
                <p>IT IS WAITING FOR YOU TO WATCH IT BACK.</p>`
        }
    ],

    total() {
        return this.level1.length + this.level2.length + this.level3.length + this.level4.length + this.level5.length;
    }
};
