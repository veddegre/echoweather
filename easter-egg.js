// ---------- Themed weather easter eggs ----------
const POOH_BASE = './pooh/';
const LOG_BASE = './log/';
const EGG_STORAGE = 'st_woods_unlocked';
const LOG_STORAGE = 'st_log_unlocked';

const WOODS_TOASTS = [
  'Off to the Hundred Acre Wood…',
  'Pooh is checking the sky for you…',
  'Owl has been consulted. Reluctantly.',
  'The woods have their own forecast now.',
];

const LOG_TOASTS = [
  'Opening the log…',
  'The keeper has the glass.',
  'Mind the bar.',
  'A weather eye, if you please.',
];

function hundredAcreLocation(){
  const loc = state?.locations?.[state?.active];
  if(!loc || loc.lat == null || loc.lon == null) return null;
  return {
    lat: loc.lat,
    lon: loc.lon,
    name: loc.name || 'Your location'
  };
}

function echoThemeQuery(extra){
  const loc = hundredAcreLocation();
  const q = new URLSearchParams(extra || {});
  if(loc){
    q.set('lat', String(loc.lat));
    q.set('lon', String(loc.lon));
    q.set('name', loc.name);
    q.set('from', 'echo');
  }
  return q;
}

function openHundredAcreWeather(){
  const loc = hundredAcreLocation();
  if(!loc){
    showLocToast('Set a location first — even the woods need coordinates.');
    return;
  }
  try{ store.set(EGG_STORAGE, '1'); }catch(e){}
  location.href = POOH_BASE + 'index.php?' + echoThemeQuery().toString();
}

function openHundredAcreGuide(){
  location.href = POOH_BASE + 'slides.php?' + echoThemeQuery({ from: 'echo' }).toString();
}

function openShipLogGuide(){
  try{ store.set(LOG_STORAGE, '1'); }catch(e){}
  location.href = LOG_BASE + 'slides.php?' + echoThemeQuery({ from: 'echo' }).toString();
}

function openShipLog(){
  const loc = hundredAcreLocation();
  if(!loc){
    showLocToast('Set a location first — the log needs a station.');
    return;
  }
  try{ store.set(LOG_STORAGE, '1'); }catch(e){}
  location.href = LOG_BASE + 'index.php?' + echoThemeQuery().toString();
}

function waitForLocationThen(fn, attempts){
  const left = attempts ?? 40;
  if(hundredAcreLocation()){ fn(); return; }
  if(left <= 0){
    showLocToast('Still waiting on a location.');
    return;
  }
  setTimeout(() => waitForLocationThen(fn, left - 1), 150);
}

function woodsTriggerFromUrl(){
  const params = new URLSearchParams(location.search);
  if(!params.has('woods')) return false;
  if(params.get('woods') === 'guide'){
    openHundredAcreGuide();
    return true;
  }
  waitForLocationThen(openHundredAcreWeather);
  return true;
}

function logTriggerFromUrl(){
  const params = new URLSearchParams(location.search);
  if(!params.has('log') && params.get('egg') !== 'log') return false;
  if(params.get('log') === 'guide'){
    waitForLocationThen(openShipLogGuide);
    return true;
  }
  waitForLocationThen(openShipLog);
  return true;
}

function woodsTriggerFromHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const path = raw.split('?')[0];
  if(path !== 'hundred-acre' && path !== 'woods') return false;
  if(raw.includes('guide')) openHundredAcreGuide();
  else waitForLocationThen(openHundredAcreWeather);
  return true;
}

function logTriggerFromHash(){
  const raw = (location.hash || '').replace(/^#/, '');
  const path = raw.split('?')[0];
  if(path !== 'logbook' && path !== 'log') return false;
  if(raw.includes('guide')) waitForLocationThen(openShipLogGuide);
  else waitForLocationThen(openShipLog);
  return true;
}

function woodsToast(){
  const i = Math.floor(Math.random() * WOODS_TOASTS.length);
  showLocToast(WOODS_TOASTS[i]);
}

function logToast(){
  const loc = hundredAcreLocation();
  const lake = (typeof greatLakeName === 'function' && loc)
    ? greatLakeName(loc.lat, loc.lon)
    : null;
  if(lake){
    showLocToast('Opening the log of ' + lake + '…');
    return;
  }
  const i = Math.floor(Math.random() * LOG_TOASTS.length);
  showLocToast(LOG_TOASTS[i]);
}

function initMarineLogEgg(){
  const title = document.getElementById('marineTitle');
  if(!title) return;

  let taps = 0;
  let tapTimer = 0;
  title.addEventListener('click', e => {
    const loc = hundredAcreLocation();
    const onLakes = loc && typeof isGreatLakesLoc === 'function' && isGreatLakesLoc(loc);
    if(!onLakes) return;
    taps++;
    clearTimeout(tapTimer);
    if(taps >= 3){
      taps = 0;
      e.preventDefault();
      logToast();
      setTimeout(openShipLog, 450);
      return;
    }
    tapTimer = setTimeout(() => { taps = 0; }, 2500);
  });
}

function initWoodsBrandEgg(){
  const brand = document.querySelector('.brand-mark');
  if(!brand) return;

  let taps = 0;
  let tapTimer = 0;
  brand.addEventListener('click', e => {
    taps++;
    clearTimeout(tapTimer);
    if(taps >= 5){
      taps = 0;
      e.preventDefault();
      woodsToast();
      setTimeout(openHundredAcreWeather, 450);
      return;
    }
    tapTimer = setTimeout(() => { taps = 0; }, 2500);
  }, true);
}

const SKY_TOLD_SIGNS = [
  ['Capricorn', 12, 22, 1, 19],
  ['Aquarius', 1, 20, 2, 18],
  ['Pisces', 2, 19, 3, 20],
  ['Aries', 3, 21, 4, 19],
  ['Taurus', 4, 20, 5, 20],
  ['Gemini', 5, 21, 6, 20],
  ['Cancer', 6, 21, 7, 22],
  ['Leo', 7, 23, 8, 22],
  ['Virgo', 8, 23, 9, 22],
  ['Libra', 9, 23, 10, 22],
  ['Scorpio', 10, 23, 11, 21],
  ['Sagittarius', 11, 22, 12, 21]
];
const SKY_TOLD_STAR = {
  Capricorn: {
    any: [
      'You already checked the pressure trend. The stars notice, and they are a little intimidated.',
      'A stubborn high builds over your to-do list. Leave one item unfinished on purpose.',
      'If the plan is solid, do not add a bonus errand just because the sky looks honest.',
      'Measure twice, then measure twice more. That is not advice. That is your personality.',
      'The spreadsheet will not save you from the sunset. Close it early today.',
      'You outwork the barometer. Nobody asked. Keep going anyway.',
      'Ambition is good. Sleep is also good. Pick one before two a.m.',
      'Your five-year plan is stronger than the jet stream. That is not always a compliment.',
      'Nobody doubts your follow-through. They doubt your ability to rest.',
      'The mountain does not move. Neither do you. That is usually a virtue.',
      'Structure is a love language. So is loosening the schedule once.',
      'You peaked at responsibility early. Allow a pointless evening.',
      'Discipline got you here. A nap gets you further.'
    ],
    storm: [
      'Storms pass. Your plan was built for this. Check the basement, not the model.',
      'You prepared for this exact weather. Congratulations, now sit still.',
      'The storm has no agenda. You have seventeen. Let it win for an hour.',
      'Even the barometer takes a break during rapid pressure falls. You can too.'
    ],
    clear: [
      'The sky gave you a clean slate and you already have three things on it.',
      'Clear air and zero excuses. Walk somewhere that is not a meeting.',
      'A perfect sky and nothing on the calendar. Let the discomfort of that be the lesson.',
      'The atmosphere did its job today. You can stop supervising it.'
    ],
    hot: [
      'The heat is testing your patience. It has no idea who it is dealing with.',
      'Efficiency drops above ninety. So should your expectations.',
      'You will try to power through the heat. The heat does not negotiate.'
    ],
    cold: [
      'Cold builds character. You already have character. Stay in.',
      'Frozen air, sharp thinking. Your season, arguably.',
      'The cold respects your work ethic. Return the favor and layer up.'
    ]
  },
  Aquarius: {
    any: [
      'You will invent a better way to watch the sky, then use the old way anyway.',
      'A weird idea about the wind is correct. Do not workshop it in a group chat.',
      'Stay curious, but come inside when the lightning does.',
      'Your contrarian streak is showing. The atmosphere does not care, but your roommate might.',
      'You are thinking three systems ahead. The current one just wants lunch.',
      'Originality is fine. Original routes during a flood watch are not.',
      'The future you are imagining is real. It just has a different dew point.',
      'You do not follow the herd. The herd does not check the radar either, so maybe one thing in common.',
      'A breakthrough is coming, but it is on your timeline, not the sky\u2019s.',
      'Social norms are someone else\u2019s forecast. Write your own.',
      'The group wants your opinion. Give half of it and keep the good half.',
      'Your independence is weather-proof. Just not waterproof. Bring a jacket.',
      'Every rebel needs a roof. Check the ceiling before the sky.'
    ],
    storm: [
      'A storm is not a metaphor right now. It is an actual storm. Go inside.',
      'You want to watch it. Fair. Watch it from a building.',
      'Chaos is your element, but lightning is not. Observe from shelter.',
      'The atmosphere is doing something unusual. You approve, but from indoors.'
    ],
    clear: [
      'Clear sky, open mind, phone off. That is the whole prescription.',
      'Visibility is excellent. So is your excuse to wander without a destination.',
      'A blank sky is an invitation to think without guardrails.',
      'Nothing overhead but possibility. Your favorite weather.'
    ],
    hot: [
      'Heat and rebellion go together. Hydrate the rebellion.',
      'Conventional wisdom says stay cool. You will find an unconventional way.',
      'The heat is conformist. Resist it with shade and water.'
    ],
    cold: [
      'Cold sharpens the mind. Yours was already sharp. Just add layers.',
      'Cold air carries clarity. Use it before the next warm front arrives.',
      'The chill is bracing. So are your opinions. Both are fine in moderation.'
    ]
  },
  Pisces: {
    any: [
      'Feelings arrive like stratus: quiet, total, and somehow damp. Name one of them.',
      'A small kindness lands better than a grand speech. Fog does not need a spotlight.',
      'Trust the hunch, then check a real observation. Poetry plus a METAR.',
      'You absorbed the mood of the sky again. Wring yourself out before bed.',
      'The daydream is valid. The umbrella is also valid. Bring both.',
      'Someone needs your gentleness today. So does the plant you forgot to water.',
      'The boundary between your feelings and the weather is decorative at best.',
      'Intuition is not data, but yours has a better track record than some models.',
      'You are the only sign that can feel a pressure change without a barometer.',
      'Creativity peaks when the sky is ambiguous. Today is ambiguous enough.',
      'You gave too much yesterday. The atmosphere noticed. Take something back.',
      'Your empathy is a weather system. It has its own fronts and advisories.',
      'The ocean does not apologize for its depth. Neither should you.'
    ],
    storm: [
      'Storms match your inner weather a little too well. This one is not yours to carry.',
      'Rain was always your element. Let it run its course without narrating.',
      'The storm is real and so is what you are feeling. Only one requires shelter.',
      'Water in every form today. You understand it all and that is exhausting.'
    ],
    clear: [
      'Clear skies feel unfamiliar. Enjoy the disorientation.',
      'Sunlight and stillness. You will try to find the sadness in it. There is none today.',
      'A dry day. Your soul is confused but your shoes are grateful.',
      'Clarity is temporary. Enjoy it like a tide pool \u2014 small, vivid, and already changing.'
    ],
    hot: [
      'Warmth pools around you like emotion. Drink cold water and call it self-care.',
      'The heat is heavy. You carry heavy things well, but not forever.',
      'Humidity matches your emotional density. Both peak in August.'
    ],
    cold: [
      'The cold asks you to feel less. Respectfully decline.',
      'Frozen things preserve. Let the cold keep one feeling safe until you are ready.',
      'Your warmth is internal and radiant. The wind chill does not apply.'
    ]
  },
  Aries: {
    any: [
      'Charge the hill, but not the one with the severe thunderstorm warning.',
      'Someone will try to slow you down. They are not the wind. You can still go.',
      'Start before you are ready. Finish before the next cell arrives.',
      'Momentum does not care about your calendar. Neither do you, apparently.',
      'You picked a fight with the forecast. The forecast does not argue back, and that makes it worse.',
      'Speed is your gift. Knowing when to brake is the upgrade.',
      'You were first out the door this morning. The sunrise barely beat you.',
      'Patience is a skill. You have other skills. Use those today.',
      'Confidence is a tailwind. Stubbornness is a headwind. Know which is blowing.',
      'Action is your default. Reflection is the patch you keep postponing.',
      'The finish line is not going anywhere. Neither is the person you nearly cut off.',
      'Your energy could power a small radar installation. Aim it.',
      'Rest is not retreat. It is reloading.'
    ],
    storm: [
      'The storm has the same energy you do. Let it go first.',
      'Lightning does not yield to enthusiasm. Take the detour.',
      'You want to race the storm. The storm does not know it is racing. Shelter.',
      'Adrenaline says go. The warning says no. The warning wins today.'
    ],
    clear: [
      'Nothing between you and the horizon. Go earn the view.',
      'A clear day is a runway. You were already taxiing.',
      'Open sky, open road, zero hesitation. Your ideal forecast.',
      'Today the atmosphere got out of your way. Accept the gift.'
    ],
    hot: [
      'The heat is daring you. Do not accept every dare.',
      'Fire signs and high temps. Redundant. Find water.',
      'Your engine runs hot. The air does too. Cool both before redlining.'
    ],
    cold: [
      'Cold air, quick legs. Your best ideas happen at pace.',
      'The cold makes you faster. Physics disagrees, but you do not listen to physics.',
      'Brisk air sharpens the charge. Go, but dress for it.'
    ]
  },
  Taurus: {
    any: [
      'Comfort is not a character flaw. Neither is leaving the porch when it gusts.',
      'Hold your ground, then eat something that is not a weather snack.',
      'A slow evening beats a dramatic one. The sky can be dramatic without you.',
      'Stubbornness is loyalty to your own rhythm. The barometer respects that.',
      'Pleasure is not a side quest. It is the main plot. Add dessert.',
      'You do not need to move fast. You need to move right. Then sit down.',
      'The couch is not a character flaw. It is infrastructure.',
      'Your patience outlasts the dew point cycle. That is either admirable or concerning.',
      'Beauty matters. The sky knows this. So does your dinner plate.',
      'Routine is the gravity that keeps you in orbit. Respect it.',
      'You will not be rushed. The atmosphere tried. The atmosphere lost.',
      'Loyalty is your weather pattern: persistent, warm, and occasionally stubborn.',
      'Luxury is a clean window with a good view. You already knew that.'
    ],
    storm: [
      'Storms want attention. You are under no obligation. Stay comfortable.',
      'You already stocked the pantry. Weather confirmed your instincts.',
      'The storm rearranges. You do not rearrange. Wait it out with something warm.',
      'Comfort during chaos is your superpower. Deploy it.'
    ],
    clear: [
      'The sky has nowhere to be and neither should you right now.',
      'Perfect conditions for doing exactly what you were already doing.',
      'A calm sky rewards those who were calm before it arrived.',
      'Clear weather and no pressure to perform. Your paradise.'
    ],
    hot: [
      'Heat melts urgency. Lean into it. Nothing is that important before dusk.',
      'The heat wants you to move. You decline. Shade and patience.',
      'Sensuality peaks in summer. So does your grocery list.'
    ],
    cold: [
      'Cold weather, warm blanket, no explanation needed.',
      'Winter is just the universe agreeing you should stay in.',
      'The cold cannot reach you through cashmere and resolve.'
    ]
  },
  Gemini: {
    any: [
      'Two tabs, two theories, one actual sky. Pick a window and look.',
      'A conversation splits like a warm front. Let the interesting side win.',
      'You can explain the radar to someone, or you can go outside. Both is greedy.',
      'Your brain has two fronts converging. Let the interesting one win.',
      'Boredom is a myth you tell yourself between hyperfixations.',
      'Switch tasks once. Not seven times. Once.',
      'You are already writing the text and the reply. Send the first one.',
      'Information is your weather. Today\u2019s is scattered with occasional insight.',
      'Curiosity killed the cat but the cat had nine lives and you have more tabs.',
      'Words come easy. Silence comes hard. Try the hard one for ten minutes.',
      'Your attention span is a hummingbird. Beautiful, fast, and gone.',
      'The duality is not a bug. It is the entire operating system.',
      'You can hold two opinions and still be right. The weather does it every day.'
    ],
    storm: [
      'A storm gives you permission to stay in and read three things at once.',
      'Commentary is your storm shelter. Narrate the thunder and feel better.',
      'Two kinds of lightning: the sky\u2019s and your ideas during the storm.',
      'The storm has your attention. That alone makes it interesting.'
    ],
    clear: [
      'Clear air, clear signal. Say the thing you keep rewording.',
      'Good visibility means you can actually see the friend you have been texting instead of visiting.',
      'Nothing in the sky to analyze. Redirect that energy to a person.',
      'Transparent skies. Try being transparent with someone too.'
    ],
    hot: [
      'Heat slows you down. That is medicine, not punishment.',
      'Too hot to think at full speed. Coast on charm instead.',
      'Summer heat makes everyone chatty. Finally, your pace.'
    ],
    cold: [
      'Cold air makes your thoughts louder. That is a warning, not a feature.',
      'The cold confines you. Your mind compensates by going everywhere else.',
      'Frigid air, fast wit. You warm any room you enter.'
    ]
  },
  Cancer: {
    any: [
      'Home pressure is falling. Text the person who makes the room feel high pressure.',
      'Protect your evening like a lake-effect band: local, intense, nobody else\u2019s business.',
      'If you nest, nest with a view of the western sky.',
      'The kitchen is your forecast office. Issue a dinner advisory.',
      'Your heart has more memory than the climate record. Let one year go.',
      'Guard the peace of your home the way a seawall guards the coast.',
      'Nostalgia is not a forecast, but you treat it like one.',
      'You felt the mood shift before anyone checked the radar.',
      'Caring is not weakness. Overgiving is not strength. Find the middle.',
      'Your shell is not hiding. It is load-bearing.',
      'Tenderness in a tough world is braver than anyone admits.',
      'You remember the weather on days that mattered. That is not trivial.',
      'The tide is yours. Let it come in. Let it go out. Do not chase it.'
    ],
    storm: [
      'A storm outside means the inside job matters more. Light something warm.',
      'Storms remind you why walls exist. So do people who drain you.',
      'You feel the storm in your chest before it shows on radar. Trust that.',
      'The rain is not personal. Your instinct to shelter everyone is, though.'
    ],
    clear: [
      'The sky is calm and so is the house. Do not invent a crisis.',
      'Step outside the shell for one hour. The sun is gentle today.',
      'Calm weather invites you out. Accept the invitation for once.',
      'Nothing threatening overhead. You can relax the perimeter.'
    ],
    hot: [
      'Heat makes the house heavy. Open something \u2014 a window, a conversation.',
      'Summer heat softens everything. Let it soften your grip too.',
      'The warmth is not smothering. That is your job description. Take a break from it.'
    ],
    cold: [
      'Cold drives everyone home. You were already there, ready.',
      'Winter is when the world finally wants what you always offer: shelter.',
      'Cold outside, warm inside. Your natural state.'
    ]
  },
  Leo: {
    any: [
      'The sun is doing bits and so are you. Save a little gold for after dusk.',
      'Compliments arrive. Accept one like the sky accepts a sunset \u2014 gracefully.',
      'You do not have to host the whole horizon. Let someone else point at the moon.',
      'You outshine the UV index today. Wear it, but also wear sunscreen.',
      'Generosity is your weather system. Make sure you are not depleted by sundown.',
      'Main character energy is fine. Just check if the scene needs a rest.',
      'Your warmth is literal and figurative. Both require hydration.',
      'Not every room needs a leader. But every room you are in has one.',
      'The spotlight is a tool, not a home. Step out of it to see what is behind you.',
      'Confidence is magnetic. Arrogance is weather damage. Know the difference today.',
      'You give more than you admit. The sun does the same.',
      'Pride is a lion. Feed it, but do not let it drive.',
      'Shine, but check on the people in your shadow.'
    ],
    storm: [
      'Even royalty stands down for a tornado warning. Crown stays on indoors.',
      'A storm is not your rival. Let it have the stage for an hour.',
      'The thunder is loud but you are louder. Save it for the clearing.',
      'Storms dim the sun. Temporarily. Same rules apply to your setbacks.'
    ],
    clear: [
      'Sunshine is your birthright. Today the sky agrees. Go collect.',
      'Clear skies and an audience of one is still an audience.',
      'The sky rolled out gold for you. Walk through it like you know.',
      'A perfect day to be exactly who you are. No edits.'
    ],
    hot: [
      'You run warm already. The heat is redundant. Shade is not weakness.',
      'Fire sign in a heat wave. Dial it back. The world is already warm.',
      'You and the sun are coworkers today. Let the sun take the lead.'
    ],
    cold: [
      'Cold dims the spotlight. Bring your own warmth \u2014 you always have.',
      'Winter cannot cool your presence. It tries every year.',
      'The cold wants you small. You have never been small. Bundle up and glow.'
    ]
  },
  Virgo: {
    any: [
      'You will want to correct the model. The model does not know you are watching.',
      'Tidy one small system. Leave the atmosphere to the atmosphere.',
      'Precision is a gift. So is stopping at good enough before midnight.',
      'Your inner auditor found a discrepancy in the dew point. Let it go.',
      'Helping is your default. Today, help yourself to doing nothing useful.',
      'The plan has seventeen steps. Step eighteen is forgiving step four.',
      'Not everything is a problem to solve. Some things are just weather.',
      'You noticed the flaw nobody else saw. You always do. Let one go.',
      'Service is noble. Burnout is not. Check your reserves like you check the data.',
      'The details matter. So does the person buried in them.',
      'Your standards are a gift to the world and a tax on your evening.',
      'Perfectionism is a forecast that never verifies. Issue a correction.',
      'You fixed something today that nobody asked about. That is love, technically.'
    ],
    storm: [
      'The storm is messy. You cannot organize it. Organize your reaction instead.',
      'Everything you prepared is working. Trust the preparation.',
      'Chaos outside. You have a checklist. The checklist will hold.',
      'The mess is temporary. Your systems are not. Breathe.'
    ],
    clear: [
      'Clean sky, clean desk, clean conscience. Almost suspicious.',
      'Clear conditions. Resist the urge to find a flaw in them.',
      'A flawless day. That should worry you, and it does. Enjoy it anyway.',
      'Perfect weather is your aesthetic. Do not overthink why.'
    ],
    hot: [
      'Heat is inefficient. You hate inefficiency. Find shade and regroup.',
      'The heat disrupts your system. Adapt the system. You are good at that.',
      'Humidity introduces variables. You will account for all of them.'
    ],
    cold: [
      'Cold is precise. You respect that. Layer precisely.',
      'Crisp air, crisp thinking. Your season in disguise.',
      'The cold does not waste energy. Neither should you.'
    ]
  },
  Libra: {
    any: [
      'Balance is not 50/50 cloud cover. Choose the nicer evening and mean it.',
      'A polite disagreement clears like haze after a cold front. Open a window.',
      'You can be fair without becoming the referee of other people\u2019s weather.',
      'Weighing options is a talent. Weighing them forever is a trap.',
      'Harmony requires one person to go first. It might as well be you.',
      'Aesthetics count. The sky agrees. Look west at golden hour.',
      'You want everyone comfortable. Start with yourself.',
      'Justice is a weather system. Slow, persistent, and worth waiting for.',
      'The scale does not have to be even today. Tip it toward rest.',
      'Beauty is not frivolous. It is the thing that makes the rest bearable.',
      'Indecision is just thoroughness with a bad reputation.',
      'Your charm is a constant. The weather is a variable. Let something else change.',
      'Fairness is your instinct. Self-care is your homework.'
    ],
    storm: [
      'A storm is not balanced. That is fine. Not everything has to be.',
      'Shelter is not a compromise. It is a decision. Make it.',
      'The storm chose a side. You can too, at least until it passes.',
      'Harmony is not possible during a squall line. Wait for the calm.'
    ],
    clear: [
      'The sky decided on blue. Commit to something with that same energy.',
      'Beautiful conditions. Stop comparing them to yesterday\u2019s.',
      'The light is flattering. So is doing nothing. Both are valid.',
      'A perfect sky asks nothing of you. Rest in the symmetry.'
    ],
    hot: [
      'Heat forces a choice: outside or not. The indecision is the discomfort.',
      'Even the air is heavy today. Delegate something.',
      'Balance means knowing when to stop being fair and start the air conditioning.'
    ],
    cold: [
      'Cold picks a side. You could learn something.',
      'The chill is decisive. You admire that. Borrow it.',
      'Cold weather, warm aesthetics. Scarf season is your runway.'
    ]
  },
  Scorpio: {
    any: [
      'Something under the surface is moving. You already knew. Do not poke it twice.',
      'Intensity is allowed. A midnight walk is allowed. A speech is optional.',
      'Keep the secret. Share the sky.',
      'Your silence says more than the forecast discussion. That is a compliment.',
      'Depth is your domain. The shallow end has better visibility, but you do not care.',
      'Trust what you sense. Then verify with a surface observation, because you will anyway.',
      'You knew this would happen. Knowing does not always help, but it is never wasted.',
      'Loyalty is quiet. So is a cold front before it arrives. Same energy.',
      'Transformation is not dramatic if you do it every day. You do it every day.',
      'The truth is not always kind. You prefer it anyway.',
      'You observe more than you reveal. The radar has the same policy.',
      'Control is a comfort. Letting go is the forecast you keep postponing.',
      'Your instincts are a weather station. The readings are rarely wrong.'
    ],
    storm: [
      'The storm matches your energy. Do not take that as encouragement.',
      'Thunder is not a personal message. It is just thermodynamics. Probably.',
      'You thrive in intensity but the lightning does not care about your threshold.',
      'The storm reveals what was hiding. You already saw it.'
    ],
    clear: [
      'A clear night is wasted on small talk. Go look at something permanent.',
      'Calm skies. The drama is internal tonight, and that is where you prefer it.',
      'Stillness outside, motion inside. Your default setting.',
      'Transparency overhead. Try a small dose of it down here.'
    ],
    hot: [
      'Heat exposes everything. You already operate exposed. Hydrate.',
      'The heat is relentless. So are you. Call it a draw and find shade.',
      'Intensity from the sky now too. Pace yourself. One source at a time.'
    ],
    cold: [
      'The cold is honest. So are you. Stay sharp.',
      'Frozen surfaces hide moving water. You understand this better than most.',
      'Winter is just the sky doing your thing: keeping what matters underneath.'
    ]
  },
  Sagittarius: {
    any: [
      'The far horizon looks better than your inbox. That is data.',
      'Say yes to one outing. No to the one that starts after the lightning.',
      'You do not need a new philosophy. You need a clear west and earlier bedtime.',
      'The road calls. Check the road conditions before answering.',
      'Your optimism is a climate, not a forecast. It survives bad days.',
      'Adventure has a return trip. Plan that part too.',
      'Freedom is not the absence of weather. It is having the right jacket.',
      'You would rather be wrong and moving than right and still.',
      'The truth you are chasing is not at the end of the road. It is the road.',
      'Bluntness is efficient. So is checking the filter once in a while.',
      'You learned something today. By tonight it will be a philosophy.',
      'Restlessness is just curiosity with legs. Take it for a walk.',
      'Your luck is real. It also prefers you hydrated and rested.'
    ],
    storm: [
      'A storm is an adventure you did not sign up for. Enjoy the plot twist from inside.',
      'Delay is not defeat. The road will exist tomorrow.',
      'You want to outrun it. You cannot. But you will try. At least check the warnings first.',
      'Storms redirect the arrow. Sometimes the redirect is the point.'
    ],
    clear: [
      'Clear sky and an open road. The universe is hinting. Take the hint.',
      'Visibility unlimited. Go somewhere you can see all of it.',
      'No clouds, no ceiling. Your favorite kind of day and everyone else\u2019s too.',
      'An honest sky. Match its energy by saying what you mean.'
    ],
    hot: [
      'Heat slows the journey. Travel early or travel cool.',
      'The heat is a border. Cross it with water and a plan.',
      'Hot air rises and so do your plans. Ground at least one.'
    ],
    cold: [
      'Cold never stopped you. Just bring the extra layer you always forget.',
      'Winter is just exploration with higher stakes. You like stakes.',
      'The cold sharpens the view. Go see something worth the chill.'
    ]
  }
};

const SKY_TOLD_WEATHER_KEYS = ['storm', 'clear', 'hot', 'cold', 'any'];

function skyToldWeatherMood(){
  const d = typeof state !== 'undefined' ? state.data : null;
  if(!d) return 'any';
  const cur = d.current || {};
  const code = cur.weather_code ?? 0;
  const temp = cur.temperature_2m;
  if(code >= 95) return 'storm';
  if(code >= 61 || code === 55 || code === 57) return 'storm';
  if(code <= 1 && (cur.cloud_cover ?? 100) < 25) return 'clear';
  if(temp != null){
    const hot = state.units === 'F' ? 90 : 32;
    const cold = state.units === 'F' ? 28 : -2;
    if(temp >= hot) return 'hot';
    if(temp <= cold) return 'cold';
  }
  return 'any';
}

function skyToldPickQuip(signPool, seed, mood){
  if(!signPool) return '';
  const mooded = signPool[mood];
  if(mooded && mooded.length){
    const combined = [...mooded, ...(signPool.any || [])];
    return eggPick(combined, seed);
  }
  return eggPick(signPool.any || [], seed);
}
const SKY_TOLD_ANIMALS = [
  { name: 'Rat', ch: '\u9F20', hints: {
    any: [
      'Notice the small leak before it is a flood.',
      'Resourcefulness is not hoarding. It is knowing where the dry shelter is.',
      'You saw the opportunity before the forecast confirmed it.',
      'Small moves, big results. The drizzle fills the reservoir.',
      'Cleverness peaks when nobody else is watching the data.',
      'Your instincts are faster than the warning system. Trust them, then verify.',
      'Adaptability is your climate. Thrive in any weather.'
    ],
    storm: [
      'A storm rewards the prepared. You were prepared last week.',
      'Small creatures survive big weather by being smarter, not bigger.'
    ],
    clear: [
      'Clear skies mean the competition is relaxed. You are not. Good.',
      'Quiet conditions. Perfect for the move nobody saw coming.'
    ],
    hot: ['Heat makes others slow. You were already three steps ahead.'],
    cold: ['The cold sharpens your edge. It was already sharp.']
  }},
  { name: 'Ox', ch: '\u725B', hints: {
    any: [
      'Steady work outlasts a flashy front.',
      'The field does not care about your mood. Plow it anyway.',
      'Patience is not passive. It is structural.',
      'You finished what they abandoned when it got hard.',
      'Endurance is your forecast: persistent, reliable, occasionally stubborn.',
      'The slow path is the one still standing after the storm.',
      'Strength without spectacle. The sky does not applaud the bedrock either.'
    ],
    storm: [
      'The storm will not move you. That has always been the arrangement.',
      'Heavy weather meets heavy resolve. You barely notice.'
    ],
    clear: [
      'A calm day rewards the work you did on the hard ones.',
      'Good conditions. Maintain the pace. You never needed the excuse to stop.'
    ],
    hot: ['Heat tests endurance. You wrote the test.'],
    cold: ['Cold and steady. Your operating temperature.']
  }},
  { name: 'Tiger', ch: '\u864E', hints: {
    any: [
      'A bold step, then a pause to hear the thunder.',
      'Courage is not the absence of caution. It is going anyway.',
      'The jungle watches you. So does the sky. Neither blinks.',
      'Power without direction is just weather. Aim it.',
      'You enter every room like a front moves through: unmistakably.',
      'Bravery is your constant. Timing is the variable.',
      'The stripe does not fade. Neither does the impression you leave.'
    ],
    storm: [
      'The storm has teeth. So do you. Respect the other predator.',
      'Even tigers shelter during the worst of it. Strength includes restraint.'
    ],
    clear: [
      'Clear sky, clean strike. Today the territory is yours.',
      'Nothing obscuring the view. Hunt what matters.'
    ],
    hot: ['The heat is fierce. So are you. Only one of you needs water.'],
    cold: ['Cold sharpens the hunter. Move with precision.']
  }},
  { name: 'Rabbit', ch: '\u5154', hints: {
    any: [
      'Soft landings. Leave early if the road ices.',
      'Gentleness is not timidity. It is choosing where to land.',
      'You sensed the shift before the instruments did.',
      'Diplomacy works. So does knowing when to run.',
      'Grace under pressure is your specialty. The barometer agrees.',
      'Quiet does not mean absent. It means listening.',
      'Your timing is impeccable when you trust it.'
    ],
    storm: [
      'The burrow was built for this. Stay low and wait.',
      'Storms are loud. You are not. That is an advantage.'
    ],
    clear: [
      'Gentle conditions match your energy. Venture out softly.',
      'A kind sky. Accept it without suspicion for once.'
    ],
    hot: ['Heat asks for stillness. You were already still.'],
    cold: ['The cold is crisp and so is your instinct. Stay warm, stay alert.']
  }},
  { name: 'Dragon', ch: '\u9F8D', hints: {
    any: [
      'Big weather, bigger patience. Do not chase every cell.',
      'You carry the storm inside. The one outside is redundant.',
      'Legend is just persistence with better lighting.',
      'Scale the ambition to the day. Even dragons rest.',
      'The sky is your element. Share it occasionally.',
      'Grandeur is exhausting for everyone except you.',
      'Your presence changes the atmospheric pressure in a room.'
    ],
    storm: [
      'The storm thinks it is impressive. It has not met you.',
      'Thunder and lightning are your backup singers. Let them finish.'
    ],
    clear: [
      'A calm sky and a dragon. The sky is being polite.',
      'Clear air lets the world see you at full span. Enjoy it.'
    ],
    hot: ['Fire-breather in a heat wave. Even you should hydrate.'],
    cold: ['Cold cannot touch the fire inside. But wear the coat anyway.']
  }},
  { name: 'Snake', ch: '\u86C7', hints: {
    any: [
      'Read the quiet sky. The loud one is already obvious.',
      'Wisdom is knowing which weather to ignore.',
      'You see the pattern before the model finishes running.',
      'Patience is not waiting. It is knowing when.',
      'Shed what is not working. The skin grows back better.',
      'Stillness is your intelligence gathering. Do not explain it.',
      'Intuition and data agree more often than either admits.'
    ],
    storm: [
      'The storm reveals. You already saw what it is uncovering.',
      'Stay coiled. The moment after the storm is yours.'
    ],
    clear: [
      'Clear conditions. Everything is visible, including your next move.',
      'A transparent sky suits a mind that sees through surfaces.'
    ],
    hot: ['Heat suits the cold-blooded. Bask strategically.'],
    cold: ['Cold slows you. Use the slowness. Think longer.']
  }},
  { name: 'Horse', ch: '\u99AC', hints: {
    any: [
      'Move while the window is open. Windows close.',
      'Freedom is your forecast. Check the road conditions first.',
      'Speed is a talent. Knowing the destination is the other talent.',
      'Your stride covers ground that others map from a desk.',
      'Energy is not the problem. Direction sometimes is.',
      'The open plain is your office. Today it is open.',
      'Restlessness is just ambition warming up.'
    ],
    storm: [
      'Even the fastest horse shelters during hail. Pace yourself.',
      'The storm blocks the path. Find a new one. You always do.'
    ],
    clear: [
      'Clear and open. Run. The sky will not ask again this nicely.',
      'Unobstructed horizon. Your favorite kind of permission.'
    ],
    hot: ['Heat and speed do not mix. Walk this one. Hydrate.'],
    cold: ['Cold air in your lungs, fire in your step. Go.']
  }},
  { name: 'Goat', ch: '\u7F8A', hints: {
    any: [
      'Gather your people. Leave the argument on the porch.',
      'Creativity peaks when the pressure is low \u2014 barometric and social.',
      'The flock matters. So does the view from slightly apart.',
      'Art is not a hobby. It is how you process the weather.',
      'Gentle persistence carved the valley. Keep going.',
      'Your kindness is structural, not decorative.',
      'The meadow is wide enough for everyone. You knew that first.'
    ],
    storm: [
      'The storm is someone else\u2019s drama. Graze through it.',
      'Shelter the herd. That is leadership, not retreat.'
    ],
    clear: [
      'Soft sky, soft heart, productive afternoon.',
      'Clear weather invites the daydream. Follow it for once.'
    ],
    hot: ['Heat and creativity. The kiln fires the clay. Make something.'],
    cold: ['Cold gathers the flock closer. You like it that way.']
  }},
  { name: 'Monkey', ch: '\u7334', hints: {
    any: [
      'A clever shortcut exists. Check it is not a gust front.',
      'Play is intelligence in disguise. The sky knows.',
      'You solved it already. Now solve it the way they can follow.',
      'Curiosity plus agility equals you. Aim both.',
      'The branch you are swinging from is strong. Probably.',
      'Wit is your weather system. It adapts to anything.',
      'Mischief is just problem-solving with style.'
    ],
    storm: [
      'The storm is chaotic. So are you. Do not compete.',
      'Even monkeys come down from the tree when it thunders.'
    ],
    clear: [
      'Clear skies and a clear head. Dangerous combination for everyone else.',
      'Good visibility means your trick will be seen. Make it a good one.'
    ],
    hot: ['Too hot to hustle. Coast on cleverness.'],
    cold: ['Cold makes you inventive. Warmer solutions incoming.']
  }},
  { name: 'Rooster', ch: '\u96DE', hints: {
    any: [
      'Announce less. Watch the sunrise more.',
      'Punctuality is a superpower. The dawn agrees.',
      'Your standards are high. So is the cirrus. Both are fine.',
      'Confidence is the crow. Competence is the follow-through.',
      'You noticed the detail everyone missed. Say it once.',
      'Organization is your element. Chaos is just a puzzle.',
      'The early call is your gift. Make sure it is worth hearing.'
    ],
    storm: [
      'No point crowing during thunder. Wait for the break.',
      'The storm ruffles feathers. Yours smooth back faster than most.'
    ],
    clear: [
      'A perfect morning. You were up before it started. As usual.',
      'Clear and orderly. Your kind of sky.'
    ],
    hot: ['Heat before dawn. Even the rooster hits snooze.'],
    cold: ['Cold, crisp mornings are your runway. Strut.']
  }},
  { name: 'Dog', ch: '\u72D7', hints: {
    any: [
      'Loyalty first. Then a walk, weather allowing.',
      'You guard what matters. The sky respects the watch.',
      'Faithfulness is not a weakness. It is load-bearing.',
      'The nose knows. Trust what you sense before the data arrives.',
      'Devotion and a good walk cure most things.',
      'Honesty is your default. The weather could learn from you.',
      'Your people are your weather. Check on them.'
    ],
    storm: [
      'Guard the door. The storm is not getting in on your watch.',
      'Loyalty means staying. Even when the wind says go.'
    ],
    clear: [
      'Clear day, long walk, good company. The whole prescription.',
      'Fair weather and a familiar trail. That is enough.'
    ],
    hot: ['Hot pavement. Short walk. Extra water. Guard the shade.'],
    cold: ['Cold nose, warm heart. The oldest forecast.']
  }},
  { name: 'Pig', ch: '\u8C6C', hints: {
    any: [
      'Comfort is a plan. Rest is not a failure of ambition.',
      'Generosity is your weather pattern. Persistent and warm.',
      'The good life is not lazy. It is curated.',
      'Abundance does not apologize. Neither should you.',
      'Enjoy the meal. Enjoy the company. Enjoy the sky. In that order.',
      'Kindness is underrated. So is a nap after lunch.',
      'You give freely. Refill freely too.'
    ],
    storm: [
      'The storm changes nothing indoors. Your setup is excellent.',
      'Weather delays are just bonus rest. Accept the gift.'
    ],
    clear: [
      'Beautiful day. Eat outside. Invite someone.',
      'Clear sky, full plate, no complaints. Paradise.'
    ],
    hot: ['Heat calls for shade and something cold to drink. Already on it.'],
    cold: ['Cold weather is blanket weather. You have been ready since October.']
  }}
];
const SKY_TOLD_STEMS = ['Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth', 'Metal', 'Metal', 'Water', 'Water'];
const SKY_TOLD_CNY = {
  2020: '2020-01-25', 2021: '2021-02-12', 2022: '2022-02-01', 2023: '2023-01-22',
  2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06',
  2028: '2028-01-26', 2029: '2029-02-13', 2030: '2030-02-03', 2031: '2031-01-23',
  2032: '2032-02-11', 2033: '2033-01-31', 2034: '2034-02-19', 2035: '2035-02-08'
};
const SKY_TOLD_LUCK = [
  'Lucky direction: wherever the wind is not in your face.',
  'Lucky hour: the one after you stop refreshing the radar.',
  'Lucky color: whatever the western sky does at dusk.',
  'Lucky number: the visibility in miles, if it is still honest.',
  'Lucky move: look up once without taking a photo.',
  'Lucky caution: do not confuse a pretty sky with a safe one.',
  'Lucky errand: the one you finish before the dew point rises.',
  'Lucky window: the ten minutes right after the front passes.',
  'Lucky sound: the wind chime that only rings when you needed the reminder.',
  'Lucky meal: the one eaten outside when the radar is empty.',
  'Lucky nap: the one that starts during drizzle and ends during sun.',
  'Lucky drive: the one where every light is green and the sky is gold.',
  'Lucky detour: the one that leads to a better view than the destination.',
  'Lucky purchase: something you did not need until the sky reminded you.',
  'Lucky timing: leaving five minutes before the downpour.',
  'Lucky conversation: the one that happens because you both stopped to watch the sky.',
  'Lucky decision: the first one. Not the revision. Not the third draft.',
  'Lucky weather: whatever is happening right now, if you stop fighting it.',
  'Lucky item: the jacket you almost left behind.',
  'Lucky view: the one from the window you never open.',
  'Lucky walk: the one taken for no reason that ends at the right thought.',
  'Lucky skill: knowing when to stop checking the forecast and trust the sky.'
];

const SKY_TOLD_ZODIAC_SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'
];
const SKY_TOLD_SIGN_LONGITUDES = {
  Aries: [0, 30], Taurus: [30, 60], Gemini: [60, 90], Cancer: [90, 120],
  Leo: [120, 150], Virgo: [150, 180], Libra: [180, 210], Scorpio: [210, 240],
  Sagittarius: [240, 270], Capricorn: [270, 300], Aquarius: [300, 330], Pisces: [330, 360]
};
function skyToldEclipticLon(ra, dec){
  const e = 23.4393 * Math.PI / 180;
  const r = ra, d = dec;
  const sinL = Math.sin(r) * Math.cos(e) + Math.tan(d) * Math.sin(e);
  const cosL = Math.cos(r);
  let lon = Math.atan2(sinL, cosL) * 180 / Math.PI;
  if(lon < 0) lon += 360;
  return lon;
}
function skyToldPlanetTransits(loc, when, natalSign){
  if(!loc || !natalSign || typeof planetSky !== 'function') return [];
  const names = { venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
  const range = SKY_TOLD_SIGN_LONGITUDES[natalSign];
  if(!range) return [];
  const hits = [];
  Object.keys(names).forEach(id => {
    const p = planetSky(id, when, loc.lat, loc.lon);
    if(!p) return;
    const el = PLANET_ORBIT[id];
    if(!el) return;
    const d = toDays(when);
    const eq = raDecFromHelio(helioXYZ(el, d), helioXYZ(PLANET_ORBIT.earth, d));
    const lon = skyToldEclipticLon(eq.ra, eq.dec);
    if(lon >= range[0] && lon < range[1]){
      hits.push({ name: names[id], up: p.alt > 5 });
    }
  });
  return hits;
}

const SKY_TOLD_BIRTH_KEY = 'st_sky_told_birth';
const SKY_TOLD_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SKY_TOLD_MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function eggHash(s){
  let h = 2166136261;
  const str = String(s || '');
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function eggPick(arr, seed){
  if(!arr?.length) return '';
  return arr[eggHash(seed) % arr.length];
}
function skyToldMonthDay(date, tz){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'numeric', day: 'numeric', year: 'numeric'
  }).formatToParts(date);
  let y = date.getFullYear(), m = 1, d = 1;
  for(const p of parts){
    if(p.type === 'year') y = +p.value;
    if(p.type === 'month') m = +p.value;
    if(p.type === 'day') d = +p.value;
  }
  return { y, m, d };
}
function skyToldSunSign(m, d){
  for(const [name, m1, d1, m2, d2] of SKY_TOLD_SIGNS){
    if(m1 === m2 && d >= d1 && d <= d2) return name;
    if(m1 < m2 && ((m === m1 && d >= d1) || (m === m2 && d <= d2))) return name;
    if(m1 > m2 && ((m === m1 && d >= d1) || (m === m2 && d <= d2))) return name;
  }
  return 'Capricorn';
}
function skyToldSignRange(name){
  const row = SKY_TOLD_SIGNS.find(s => s[0] === name);
  if(!row) return '';
  const a = SKY_TOLD_MONTH_SHORT[row[1] - 1] + ' ' + row[2];
  const b = SKY_TOLD_MONTH_SHORT[row[3] - 1] + ' ' + row[4];
  return a + '\u2013' + b;
}
function skyToldDaysInMonth(m, y){
  return new Date(y || 2024, m, 0).getDate();
}
function skyToldLoadBirth(){
  let v = null;
  try{ v = typeof store !== 'undefined' ? store.get(SKY_TOLD_BIRTH_KEY) : null; }catch(e){}
  const m = +v?.m || 0;
  const d = +v?.d || 0;
  const y = +v?.y || 0;
  return { m, d, y };
}
function skyToldSaveBirth(birth){
  try{
    if(typeof store !== 'undefined') store.set(SKY_TOLD_BIRTH_KEY, birth);
  }catch(e){}
}
function skyToldReadBirthForm(){
  const monthEl = document.getElementById('skyToldMonth');
  const dayEl = document.getElementById('skyToldDay');
  const yearEl = document.getElementById('skyToldYear');
  return {
    m: monthEl ? +monthEl.value : 0,
    d: dayEl ? +dayEl.value : 0,
    y: yearEl ? +yearEl.value : 0
  };
}
function skyToldFillBirthSelects(){
  const monthEl = document.getElementById('skyToldMonth');
  const dayEl = document.getElementById('skyToldDay');
  const yearEl = document.getElementById('skyToldYear');
  if(!monthEl || !dayEl || !yearEl) return;
  const saved = skyToldLoadBirth();
  if(!monthEl.options.length){
    monthEl.appendChild(new Option('Month', '0'));
    SKY_TOLD_MONTHS.forEach((name, i) => monthEl.appendChild(new Option(name, String(i + 1))));
    dayEl.appendChild(new Option('Day', '0'));
    for(let d = 1; d <= 31; d++) dayEl.appendChild(new Option(String(d), String(d)));
    yearEl.appendChild(new Option('Year', '0'));
    const thisYear = new Date().getFullYear();
    for(let y = thisYear; y >= 1924; y--) yearEl.appendChild(new Option(String(y), String(y)));
  }
  monthEl.value = saved.m ? String(saved.m) : '0';
  dayEl.value = saved.d ? String(saved.d) : '0';
  yearEl.value = saved.y ? String(saved.y) : '0';
}
function skyToldLunarYear(y, m, d){
  const cny = SKY_TOLD_CNY[y];
  if(!cny){
    if(m === 1 || (m === 2 && d < 10)) return y - 1;
    return y;
  }
  const [ , cm, cd] = cny.split('-').map(Number);
  if(m < cm || (m === cm && d < cd)) return y - 1;
  return y;
}
function skyToldZodiac(lunarYear){
  const idx = ((lunarYear - 4) % 12 + 12) % 12;
  const stem = ((lunarYear - 4) % 10 + 10) % 10;
  const animal = SKY_TOLD_ANIMALS[idx];
  return { ...animal, element: SKY_TOLD_STEMS[stem], lunarYear };
}
function skyToldBits(loc, when){
  const bits = { moon: 'the moon', moonUp: false, planet: null };
  if(typeof moonIllumination === 'function' && typeof phaseName === 'function'){
    const ill = moonIllumination(when);
    const row = phaseName(ill.phase);
    bits.moon = (row && row[1] ? row[1] : 'the moon').toLowerCase();
  }
  if(loc && typeof moonPosition === 'function'){
    bits.moonUp = moonPosition(when, loc.lat, loc.lon).alt > 0;
  }
  if(loc && typeof planetSky === 'function'){
    const names = { venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
    let best = null;
    Object.keys(names).forEach(id => {
      const p = planetSky(id, when, loc.lat, loc.lon);
      if(!p || p.alt < 8 || p.elong < 15) return;
      if(!best || p.alt > best.alt) best = { name: names[id], alt: p.alt };
    });
    bits.planet = best;
  }
  return bits;
}
function fillSkyToldEgg(){
  const loc = hundredAcreLocation();
  const tz = (typeof state !== 'undefined' && state.data && state.data.timezone)
    || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = new Date();
  const md = skyToldMonthDay(when, tz);
  const transitSign = skyToldSunSign(md.m, md.d);
  const birth = skyToldReadBirthForm();
  const dayMax = birth.m ? skyToldDaysInMonth(birth.m, birth.y || 2024) : 31;
  if(birth.d > dayMax) birth.d = dayMax;
  const natalSign = (birth.m && birth.d) ? skyToldSunSign(birth.m, birth.d) : null;
  const natalYear = birth.y
    ? skyToldLunarYear(birth.y, birth.m || 6, birth.d || 15)
    : 0;
  const natalZo = natalYear ? skyToldZodiac(natalYear) : null;
  const yearZo = skyToldZodiac(skyToldLunarYear(md.y, md.m, md.d));
  const bits = skyToldBits(loc, when);
  const placeEl = document.getElementById('skyToldPlace');
  const starHead = document.getElementById('skyToldStarHead');
  const starBody = document.getElementById('skyToldStar');
  const zoHead = document.getElementById('skyToldZodiacHead');
  const zoBody = document.getElementById('skyToldZodiac');
  const place = loc
    ? (loc.name + ' \u00B7 ' + md.m + '/' + md.d)
    : ('Today \u00B7 ' + md.m + '/' + md.d);
  if(placeEl) placeEl.textContent = place;

  if(!natalSign){
    if(starHead) starHead.textContent = 'Your sun sign';
    if(starBody){
      starBody.textContent = 'The sun is in ' + transitSign + ' today \u2014 that is the sky, not a personal horoscope. '
        + 'Everyone with the same birthday shares a sun sign (for example Aug 18 is Leo). Pick month and day above.';
    }
  }else{
    const mood = skyToldWeatherMood();
    const seed = [md.y, md.m, md.d, loc?.lat?.toFixed(2), loc?.lon?.toFixed(2), natalSign].join('|');
    const signPool = SKY_TOLD_STAR[natalSign] || SKY_TOLD_STAR.Leo;
    const star = skyToldPickQuip(signPool, seed + '|star', mood);
    const skyParts = [];
    if(bits.moonUp){
      skyParts.push('The ' + bits.moon + ' is up tonight.');
    }
    if(bits.planet){
      skyParts.push(bits.planet.name + ' is visible in the sky right now.');
    }
    const transits = skyToldPlanetTransits(loc, when, natalSign);
    transits.forEach(t => {
      skyParts.push(t.up
        ? (t.name + ' is transiting ' + natalSign + ' and visible tonight.')
        : (t.name + ' is passing through ' + natalSign + ' right now.'));
    });
    if(transitSign === natalSign){
      skyParts.push('The sun is in ' + transitSign + ' right now \u2014 your sign season.');
    }else{
      skyParts.push('The sun is currently in ' + transitSign + '.');
    }
    if(starHead) starHead.textContent = 'You are ' + natalSign + ' \u00B7 ' + skyToldSignRange(natalSign);
    if(starBody){
      starBody.textContent = star + ' ' + skyParts.join(' ');
    }
  }

  if(!natalZo){
    if(zoHead) zoHead.textContent = 'Chinese zodiac';
    if(zoBody){
      zoBody.textContent = 'This lunar year is ' + yearZo.element + ' ' + yearZo.name + ' for everyone. '
        + 'Add a birth year to see your animal.';
    }
  }else{
    const mood = typeof skyToldWeatherMood === 'function' ? skyToldWeatherMood() : 'any';
    const seed = [md.y, md.m, md.d, natalZo.name, loc?.lat?.toFixed(2)].join('|');
    const animalHint = natalZo.hints
      ? skyToldPickQuip(natalZo.hints, seed + '|zo', mood)
      : (natalZo.hint || '');
    const luck = eggPick(SKY_TOLD_LUCK, seed + '|luck');
    if(zoHead){
      zoHead.textContent = 'You are a ' + natalZo.element + ' ' + natalZo.name + '  ' + natalZo.ch
        + ' \u00B7 year ' + natalZo.lunarYear;
    }
    if(zoBody){
      zoBody.textContent = animalHint + ' ' + luck
        + ' This lunar year is ' + yearZo.element + ' ' + yearZo.name + ' for the calendar.';
    }
  }
}
function closeSkyToldEgg(){
  const egg = document.getElementById('skyToldEgg');
  if(egg) egg.hidden = true;
  document.body.classList.remove('sky-told-open');
}
function openSkyToldEgg(){
  skyToldFillBirthSelects();
  fillSkyToldEgg();
  const egg = document.getElementById('skyToldEgg');
  if(!egg) return;
  egg.hidden = false;
  document.body.classList.add('sky-told-open');
  const birth = skyToldReadBirthForm();
  const focusEl = (!birth.m && document.getElementById('skyToldMonth'))
    || document.getElementById('skyToldClose');
  if(focusEl) focusEl.focus();
}
function initSkyToldEgg(){
  const panel = document.getElementById('tonightSkyPanel');
  const title = panel && panel.querySelector('h2');
  const egg = document.getElementById('skyToldEgg');
  if(!title || !egg) return;
  skyToldFillBirthSelects();
  ['skyToldMonth', 'skyToldDay', 'skyToldYear'].forEach(id => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('change', () => {
      skyToldSaveBirth(skyToldReadBirthForm());
      fillSkyToldEgg();
    });
  });
  let taps = 0;
  let tapTimer = 0;
  title.addEventListener('click', e => {
    taps++;
    clearTimeout(tapTimer);
    if(taps >= 3){
      taps = 0;
      e.preventDefault();
      if(typeof showLocToast === 'function') showLocToast('The stars insist on a word\u2026');
      setTimeout(openSkyToldEgg, 400);
      return;
    }
    tapTimer = setTimeout(() => { taps = 0; }, 2500);
  });
  const close = document.getElementById('skyToldClose');
  const backdrop = document.getElementById('skyToldBackdrop');
  if(close) close.addEventListener('click', closeSkyToldEgg);
  if(backdrop) backdrop.addEventListener('click', closeSkyToldEgg);
  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && !egg.hidden) closeSkyToldEgg();
  });
}

function initEasterEgg(){
  if(logTriggerFromUrl() || woodsTriggerFromUrl()) return;

  const onHash = () => {
    if(logTriggerFromHash() || woodsTriggerFromHash()){
      history.replaceState(null, '', location.pathname + location.search);
    }
  };
  if(logTriggerFromHash() || woodsTriggerFromHash()) onHash();
  window.addEventListener('hashchange', onHash);

  initWoodsBrandEgg();
  initMarineLogEgg();
  initSkyToldEgg();
}
