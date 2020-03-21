const KEY_ENTER=13
const KEY_BACKQUOTE=192

var global = {
	show_info: true,
	overlay_numbers: true,
	speed: 1,
	running: false,
	simulation: undefined,
	ui: {}
}

// const COLOR_HEALTHY          = "#000088"
// const COLOR_SICK             = "#880000"
// const COLOR_RECOVERED        = "#444488"

const COLOR_HEALTHY          = "#2869AD"
const COLOR_SICK             = "#C5542F"
const COLOR_RECOVERED        = "#F5BB77"

// #595959"

// const COLOR_HEALTHY_STATIC   = "#000088F0"
// const COLOR_SICK_STATIC      = "#880000F0"
// const COLOR_RECOVERED_STATIC = "#008800F0"


const COLOR_INFO_MSG      = '#ffffffc0'

const COLOR_CONTROLS_BG      = '#A0A0A0'
const COLOR_SIMULATION_BG    = '#FFFFFF'
const COLOR_TSERIES_BG       = '#888888'
// const COLOR_WORLD_BG         = '#666666'
// const COLOR_WORLD_BG         = '#000000'
const COLOR_WORLD_BG         = '#f0f0f0'

// const COLOR_HEALTHY          = "#ABC7CA"
// const COLOR_SICK             = "#BB652E"
// const COLOR_RECOVERED        = "#CB8AC0"

const COLOR_INCIDENT         = '#ffffff'
// const COLOR_INCIDENT         = '#000000'

// const COLOR_HEALTHY_STATIC   = "#ABC7CAF8"
// const COLOR_SICK_STATIC      = "#BB652EF8"
// const COLOR_RECOVERED_STATIC = "#CB8AC0F8"

const STATUS_HEALTHY   = 0
const STATUS_SICK      = 1
const STATUS_RECOVERED = 2

//
// have a button to start the simulation
// fixed population
//     same dynamics
//

//
// health_status: indicates the iteration where it subject 
// was first contaminated. Zero means patient was never
// contaminated
//
// subject is healty and does not contagious when health
// status is either zero or the 
//
//       iteration - health_status >= recovery_steps
//

function aux_health_status_(hs, iteration, recovery_steps)
{
	if (hs == 0) { return STATUS_HEALTHY }
	else if (iteration - hs < recovery_steps) { return STATUS_SICK }
	else { return STATUS_RECOVERED }
}

function simulation_update_interactions(simulation)
{

	let new_in_contact_with = []
	for (let i=0;i<simulation.n;++i) {
		new_in_contact_with.push([])
	}

	// quadratic search for interactions
	for (let i=0;i<simulation.n;i++) {
		let subject_i = simulation.subjects[i]
		for (let j=i+1;j<simulation.n;j++) {
			let subject_j = simulation.subjects[j]
			let dx = subject_i.px - subject_j.px
			let dy = subject_i.py - subject_j.py
			let d2 = dx * dx + dy * dy
			if (d2 <= simulation.hit_distance2) {
				new_in_contact_with[i].push(j)
				new_in_contact_with[j].push(i)
				// console.log("contact: " + i + " x " + j)
			}
		}
	}

	let new_interactions   = 0

	// check for each subject the new interactions found and
	// update their health status based on these interactions
	function new_interaction(index_subject_a, index_subject_b) {
		// console.log("interaction: " + index_subject_a + " x " + index_subject_b)
		let subject_a = simulation.subjects[index_subject_a]
		let subject_b = simulation.subjects[index_subject_b]

		++new_interactions

		let coin_flip = Math.random()

		// same dynamic with different parameters
		// update the status of each simulation
		for (let i=0;i<simulation.m;++i) {
			let recovery_steps_index = Math.floor(i / simulation.contagion_probs.length)
			let infection_rate_index = i % simulation.contagion_probs.length
			let recovery_steps = simulation.recovery_steps[recovery_steps_index]
			let infection_rate = simulation.contagion_probs[infection_rate_index]

			let subject_a_status = aux_health_status_(subject_a.health_status[i], simulation.iteration, recovery_steps)
			let subject_b_status = aux_health_status_(subject_b.health_status[i], simulation.iteration, recovery_steps)

			if (subject_a_status == STATUS_HEALTHY && subject_b_status == STATUS_SICK) {
				// b might contaminate a now
				let contaminate = coin_flip <= infection_rate
				if (contaminate) {
					subject_a.health_status[i] = simulation.iteration
				}
			} else if (subject_a_status == STATUS_SICK && subject_b_status == STATUS_HEALTHY) {
				// a might contaminate b now
				// b might contaminate a now
				let contaminate = coin_flip <= infection_rate
				if (contaminate) {
					subject_b.health_status[i] = simulation.iteration
				}
			}
		}
	}

	for (let i=0;i<simulation.n;i++) {
		let a = simulation.subjects[i].in_contact_with
		let b = new_in_contact_with[i]
		b.sort()

		let ia = 0;
		let ib = 0;
		while (ia < a.length && ib < b.length) {
			if (a[ia] < b[ib]) {
				++ia
			} else if (a[ia] > b[ib]) {
				// a new contact was found
				if (i < b[ib]) {
					new_interaction(i,b[ib])
				}
				++ib
			} else {
				++ia
				++ib
			}
		}
		while (ib < b.length) {
			if (i < b[ib]) {
				new_interaction(i,b[ib])
			}
			++ib
		}
		simulation.subjects[i].in_contact_with = b
	}

	let max_sick_across_config = 0

	let iteration_status = []
	for (let i=0;i<simulation.m;++i) {
		let recovery_steps_index = Math.floor(i / simulation.contagion_probs.length)
		let infection_rate_index = i % simulation.contagion_probs.length
		let recovery_steps = simulation.recovery_steps[recovery_steps_index]
		let infection_rate = simulation.contagion_probs[infection_rate_index]

		let healthy = 0
		let sick = 0
		let recovered = 0

		for (let j=0;j<simulation.n;j++) {
			let subject = simulation.subjects[j]

			let health = aux_health_status_(subject.health_status[i], simulation.iteration, recovery_steps)
			if (health == STATUS_HEALTHY) {
				++healthy
			} else if (health == STATUS_SICK) {
				++sick
			} else {
				++recovered
			}
		}

		iteration_status.push({
			healthy: healthy,
			sick: sick,
			recovered: recovered
		})

		max_sick_across_config = Math.max(max_sick_across_config, sick)

		simulation.max_sick[i] = Math.max(simulation.max_sick[i], sick)

	}

	simulation.history.push(iteration_status)
	simulation.done = max_sick_across_config == 0
	if (simulation.done) {
		global.running = false
	}

	simulation.pairwise_interactions   += new_interactions

}

function simulation_init(population, initially_sick, radius, width, height, contagion_probs, contagion_probs_raw, recovery_widths, static_population_ratio)
{

	let steps_to_px = 2
	let speed_unit_in_px = 1.0 / steps_to_px
	let rs = []
	for (let i=0;i<recovery_widths.length;i++) {
		rs.push(Math.round((recovery_widths[i] * width)/speed_unit_in_px))
	}
	let m = contagion_probs.length * recovery_widths.length
	let sim_area_margin = radius + 4
	let simulation = {
		n:      population, // population size
		steps_to_px: steps_to_px,
		speed_unit_in_px: speed_unit_in_px,
		initially_sick: initially_sick,
		sim_area: [sim_area_margin, sim_area_margin, width, height],
		width:  width + 2*sim_area_margin,
		height: height + 2*sim_area_margin,
		radius: radius,
		hit_distance2: (2*radius) * (2*radius),
		step_length: 1,
		iteration: 1,
		static_population_ratio: static_population_ratio,
		subjects: [],
		m: m,
		contagion_probs: contagion_probs,
		contagion_probs_raw: contagion_probs_raw,
		recovery_steps: rs,
		recovery_distances: recovery_widths,
		max_sick: new Array(m).fill(0),
		done: false,
		history: [],
		pairwise_interactions: 0
	}

	let n = population

	let mobile_subjects = Math.round((1.0-static_population_ratio) * n)
	// the sick subject

	for (let i=0;i<n;i++) {
		let vx = 0.0
		let vy = 0.0
		if (i < mobile_subjects) { 
			let theta = Math.random() * Math.PI * 2
			vx = speed_unit_in_px * Math.cos(theta)
			vy = speed_unit_in_px * Math.sin(theta)
		}

		health_status = (i < simulation.initially_sick) ? 1 :  0

		simulation.subjects.push( {
			px: simulation.sim_area[0] + Math.random() * simulation.sim_area[2],
			py: simulation.sim_area[1] + Math.random() * simulation.sim_area[3],
			vx: vx,
			vy: vy,
			interaction_count: 0,
			in_contact_with: new Set(),
			health_status: new Array(simulation.m).fill(health_status) 
		})
	}


	simulation_update_interactions(simulation)

	return simulation

}

function simulation_move_subjects(simulation, weight)
{
	// simply move the subject around
	for (let i=0;i<simulation.n;i++) {

		let subject = simulation.subjects[i]

		subject.px += weight * subject.vx
		subject.py += weight * subject.vy

		let sim_area = simulation.sim_area
		let x0 = sim_area[0]
		let y0 = sim_area[1]
		let x1 = sim_area[0] + sim_area[2]
		let y1 = sim_area[1] + sim_area[3]

		if (subject.px < x0) {
			subject.vx = -subject.vx
			subject.px = 2*x0 - subject.px
		} else if (subject.px >= x1) {
			subject.vx = -subject.vx
			subject.px = 2*x1 - subject.px
		}

		if (subject.py < y0) {
			subject.vy = -subject.vy
			subject.py = 2*y0 - subject.py
		} else if (subject.py >= y1) {
			subject.vy = -subject.vy
			subject.py = 2*y1 - subject.py
		}
	}
}

function simulation_step(simulation, no_steps)
{
	// how many pixels
	let q = Math.floor(no_steps/simulation.steps_to_px)
	let r = no_steps % simulation.steps_to_px
	for (let i=0;i<q;i++) {
		simulation_move_subjects(simulation, simulation.steps_to_px)
		simulation_update_interactions(simulation)
		simulation.iteration += simulation.steps_to_px
	}
	simulation_move_subjects(simulation, r)
	simulation_update_interactions(simulation)
	simulation.iteration += r
}

function render_simulation(simulation)
{
	let canvas = global.ui.main_canvas
	let ctx = canvas.getContext('2d')


	canvas.width  = window.innerWidth;
	canvas.height = window.innerHeight;

	//
	// TODO make sure we can mix eigher with black or with white
	// satellite images mix better with white
	//
	ctx.beginPath();
	ctx.rect(0, 0, canvas.width, canvas.height);
	ctx.closePath();
	ctx.fillStyle = COLOR_SIMULATION_BG;
	// ctx.fillStyle = "black";
	ctx.fill();

	let hmargin0 = 15 
	let hmargin = 30
	let vmargin0 = 5
	let vmargin = 5 + simulation.radius

	let height_header = 18
	let width_header = simulation.width
	let height_world = simulation.height
	let height_tseries = Math.floor(simulation.height/4)
	let width_tseries = simulation.width
	let width_world = simulation.width
	let width = hmargin + simulation.width
	let height = vmargin + height_header + height_tseries + vmargin + height_world

	let ncol = simulation.contagion_probs.length
	let nrow = simulation.recovery_steps.length

	for (let i=0;i<simulation.m;i++) {
		let row = Math.floor(i / simulation.contagion_probs.length)
		let col = i % simulation.contagion_probs.length

		let contagion_probs_raw = simulation.contagion_probs_raw[col]
		let recovery_steps = simulation.recovery_steps[row]
		let recovery_distance = simulation.recovery_distances[row]

		// x0, y0, width, height
		let header_view   = [ col * width + hmargin0, row * height + vmargin0, width_header, height_header]
		let tseries_view  = [ col * width + hmargin0, row * height + vmargin0 + height_header , width_tseries, height_tseries ]
		let world_view    = [ col * width + hmargin0, row * height + vmargin0 + height_header + height_tseries + vmargin, width_world, height_world]

		//-----------------
		// Time Series
		//-----------------
	
		// use sampling...

		let iterations = simulation.history.length
		let max_iter = tseries_view[2]

		ctx.fillStyle = COLOR_TSERIES_BG
		ctx.beginPath()
		ctx.rect(tseries_view[0], tseries_view[1], tseries_view[2], tseries_view[3])
		ctx.fill()

		// let dx = tseries_view[2] / iterations
		let len = Math.min(max_iter, iterations)

		// for perf. factor the three color bars
		ctx.font = "11px Monaco";
		ctx.fillStyle = COLOR_HEALTHY
		for (let j=0;j<len;++j) {
			// use first and last
			let index = j 
			if (iterations > max_iter) { index = Math.floor(j/(len-1) * (iterations-1)) }

			let data = simulation.history[index][i]
			let height_healthy   = (data.healthy * tseries_view[3]) / simulation.n
			let height_recovered = (data.recovered * tseries_view[3]) / simulation.n 
			let height_sick = (data.sick * tseries_view[3]) / simulation.n

			ctx.beginPath();
			ctx.rect(tseries_view[0] + j, tseries_view[1], 1, height_healthy);
			ctx.fill();
		}

		ctx.fillStyle = COLOR_RECOVERED
		for (let j=0;j<len;++j) {
			// use first and last
			let index = j 
			if (iterations > max_iter) { index = Math.floor(j/(len-1) * (iterations-1)) }

			let data = simulation.history[index][i]
			let height_healthy   = (data.healthy * tseries_view[3]) / simulation.n
			let height_recovered = (data.recovered * tseries_view[3]) / simulation.n 

			ctx.beginPath();
			ctx.rect(tseries_view[0] + j, tseries_view[1] + height_healthy, 1, height_recovered);
			ctx.fill();
		}

		ctx.fillStyle = COLOR_SICK
		for (let j=0;j<len;++j) {
			// use first and last
			let index = j 
			if (iterations > max_iter) { index = Math.floor(j/(len-1) * (iterations-1)) }

			let data = simulation.history[index][i]
			let height_healthy   = (data.healthy * tseries_view[3]) / simulation.n
			let height_recovered = (data.recovered * tseries_view[3]) / simulation.n 
			let height_sick = (data.sick * tseries_view[3]) / simulation.n 

			ctx.beginPath();
			ctx.rect(tseries_view[0] + j, tseries_view[1] + height_healthy + height_recovered, 1, height_sick);
			ctx.fill();

			if (j == len-1) {


				let inter = simulation.pairwise_interactions

				// write the number
				ctx.textAlign="left"
				let header_text = "cp:" + contagion_probs_raw+ " rd:" + recovery_distance + " it:" + simulation.iteration  + " pi:" + inter
				// + " h:" +data.healthy + " r:" +data.recovered + " s:" +data.sick  + " Ms:" + simulation.max_sick[i]
				ctx.fillStyle = "black"
				ctx.fillText(header_text, header_view[0] + 5, header_view[1] + header_view[3]/2 + 4)
			}
		}

		//-----------------
		// World
		//-----------------
		
		ctx.fillStyle = COLOR_WORLD_BG
		ctx.beginPath()
		ctx.rect(world_view[0], world_view[1], world_view[2], world_view[3])
		ctx.fill()

		// 
		let groups = []

		for (let j=0;j<simulation.n;++j) {
			let subject = simulation.subjects[j]
			let health = aux_health_status_(subject.health_status[i], simulation.iteration, recovery_steps)
			let is_static = subject.vx == 0.0 && subject.vy == 0.0
			groups.push([health, is_static, j])
		}

		// assume a group is a triple [health, is_static, index]
		function cmp_group(a,b) {
			let diff0 = a[0] - b[0]
			if (diff0) { return diff0 }
			else { return a[1] - b[1] }
		}
		groups.sort(cmp_group)

		function set_group_fill_style(group) {
			let health = group[0]
			let is_static = group[1]
			if (health == STATUS_HEALTHY) {
				// never infected
				ctx.fillStyle = COLOR_HEALTHY//  + (is_static ? 'FF' : '8f')
			} else if (health == STATUS_SICK) {
				// sick
				ctx.fillStyle = COLOR_SICK// + (is_static ? 'FF' : '8f')
			} else {
				// recovered
				ctx.fillStyle = COLOR_RECOVERED // + (is_static ? 'FF' : '8f')
			}
		}

		let previous_group = undefined
		for (let j=0;j<groups.length;j++) {
			let group = groups[j]
			if (!previous_group) {				
				set_group_fill_style(group)
				ctx.beginPath()
				previous_group = group
			} else if (cmp_group(previous_group,group) != 0) {
				// fill previous group
				ctx.fill()
				set_group_fill_style(group)
				previous_group = group
				ctx.beginPath()
			}
			let subject = simulation.subjects[group[2]]
			let px = world_view[0] + subject.px
			let py = world_view[1] + subject.py

			let r = simulation.radius
			if (group[1]) {
				// static are squares
				ctx.rect(px-r,py-r,2*r,2*r) // 0,2*Math.PI)
			} else {
				ctx.moveTo(px,py)
				ctx.arc(px,py,r,0,2*Math.PI)
			}
		}
		if (previous_group) {
			ctx.fill()
		}

		ctx.fillStyle = COLOR_INCIDENT // ffffff60;
		ctx.beginPath()
		for (let j=0;j<groups.length;j++) {
			let subject = simulation.subjects[j]
			if (subject.in_contact_with.length) {
				let px = world_view[0] + subject.px
				let py = world_view[1] + subject.py
				let r = simulation.radius
				ctx.moveTo(px,py)
				ctx.arc(px,py,1,0,2*Math.PI)
			}
		}
		ctx.fill()



		// overlay
		if (global.overlay_numbers) {

			if (!global.running || global.simulation.done) {
				ctx.fillStyle = "#ffffff80"
				ctx.beginPath()
				ctx.rect(world_view[0], world_view[1], world_view[2], world_view[3])
				ctx.fill()
			}

			ctx.font = "28px Monaco";
			// write the number
			ctx.textAlign="right"
			let data = simulation.history[simulation.history.length-1][i]
			let y0 = 26
			let dy = 34
			let y = y0
			{
				ctx.fillStyle = COLOR_HEALTHY+ "80"
				let text = "h:" + data.healthy
				ctx.fillText(text, world_view[0] + world_view[2] - 10, world_view[1] + y)
				y += dy
			}
			{
				ctx.fillStyle = COLOR_RECOVERED + "80"
				let text = "r:" + data.recovered
				ctx.fillText(text, world_view[0] + world_view[2] - 10, world_view[1] + y)
				y += dy
			}
			{
				ctx.fillStyle = COLOR_SICK + "80"
				let text = "s:"+ data.sick
				ctx.fillText(text, world_view[0] + world_view[2] - 10, world_view[1] + y)
				y += dy
			}
			{
				ctx.fillStyle = "#ff0000" + "80"
				let text = "Ms:"+ simulation.max_sick[i]
				ctx.fillText(text, world_view[0] + world_view[2] - 10, world_view[1] + world_view[3] - 5)
				y += dy
			}
		}


		// if (subject.in_contact_with.length > 0) {
		// 	ctx.stroke()
		// }
	}
}

function ui_show_info(flag)
{
	global.show_info = flag
	if (flag) {
		// global.ui.main_div.style.visibility="hidden"
		global.ui.msg_div.style.visibility="visible"
	} else {
		// global.ui.main_div.style.visibility="visible"
		global.ui.msg_div.style.visibility="hidden"
	}
}

function update()
{
	if (global.simulation) {
		render_simulation(global.simulation)
		if (global.simulation.done) {
			return
		}
	}

	if (global.simulation && global.running) {
		simulation_step(global.simulation, global.speed)
		setTimeout(update, 30)
	}
}

function reset_simulation()
{
	let population = parseInt(global.ui.population_input.value)
	if (isNaN(population)) {
		alert("Error parsing Population")
		return
	}

	let initially_sick = parseInt(global.ui.initially_sick_input.value)
	if (isNaN(initially_sick)) {
		alert("Error parsing Initially Sick")
		return
	}

	let speed = parseInt(global.ui.speed_input.value)
	global.speed = speed
	if (isNaN(speed)) {
		alert("Error parsing Speed")
		return
	}

	let social_distancing = parseFloat(global.ui.social_distancing_input.value)
	if (isNaN(social_distancing)) {
		alert("Error parsing Social Distancing")
		return
	}

	let radius = parseFloat(global.ui.radius_input.value)
	if (isNaN(radius)) {
		alert("Error parsing Radius")
		return
	}

	let panel_size = parseInt(global.ui.panel_size_input.value)
	if (isNaN(panel_size)) {
		alert("Error parsing Panel Size")
		return
	}
	let contagion_probs_raw = global.ui.contagion_probs_input.value.split(" ");
	let contagion_probs = []
	for (let i=0;i<contagion_probs_raw.length;i++) {
		let cp = contagion_probs_raw[i]
		let num_den = cp.split('/')
		if (num_den.length  == 1) {
			contagion_probs.push(parseFloat(num_den[0]))
			// contagion_probs[i] = parseFloat(num_den[0])
			if (isNaN(contagion_probs[i])) {
				alert("Error parsing contagion prob. use space to separate probs")
				return
			}
		} else if (num_den.length == 2) {
			contagion_probs.push(parseFloat(num_den[0]) / parseFloat(num_den[1]))
			if (isNaN(contagion_probs[i])) {
				alert("Error parsing contagion prob. use space to separate probs")
				return
			}

		}
	}
	let recovery_steps = global.ui.recovery_steps_input.value.split(" ");
	for (let i=0;i<recovery_steps.length;i++) {
		recovery_steps[i] = parseFloat(recovery_steps[i])
		if (isNaN(recovery_steps[i])) {
			alert("Error parsing recovery steps. use space to separate recov. steps")
			return
		}
	}

	// set global simulation
	global.simulation = simulation_init(population, initially_sick, radius, panel_size, panel_size, contagion_probs, contagion_probs_raw, recovery_steps, social_distancing)
	global.running = false
	global.ui.play_input.value = global.running ? 'Pause' : 'Play'
}

// input {
//     -webkit-writing-mode: horizontal-tb !important;
//     text-rendering: auto;
//     color: -internal-light-dark-color(black, white);
//     letter-spacing: normal;
//     word-spacing: normal;
//     text-transform: none;
//     text-indent: 0px;
//     text-shadow: none;
//     display: inline-block;
//     text-align: start;
//     -webkit-appearance: textfield;
//     background-color: -internal-light-dark-color(white, black);
//     -webkit-rtl-ordering: logical;
//     cursor: text;
//     margin: 0em;
//     font: 400 11px system-ui;
//     padding: 1px;
//     border-width: 2px;
//     border-style: inset;
//     border-color: initial;
//     border-image: initial;
// }


function main()
{
	var sheet = document.createElement('style')
	sheet.innerHTML = `
html, body, div, span, applet, object, iframe,
h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code,
del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var,
b, u, i, center,
dl, dt, dd, ol, ul, li,
fieldset, form, label, legend,
table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, 
figure, figcaption, footer, header, hgroup, 
menu, nav, output, ruby, section, summary,
time, mark, audio, video, input {
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 100%;
    font: Helvetica;
    font-family: Sans-Serif;
    vertical-align: baseline;
}
/* HTML5 display-role reset for older browsers */
article, aside, details, figcaption, figure, 
footer, header, hgroup, menu, nav, section {
    display: block;
}
body {
    line-height: 1;
}
ol, ul {
    list-style: none;
}
blockquote, q {
    quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
    content: '';
    content: none;
}
table {
    border-collapse: collapse;
    border-spacing: 0;
}


// * {
// 	margin: 0;
// 	padding: 0;
// 	border: 0;
// 	font-size: 12pt;
//     	font-family: sans-serif;
// 	list-style: none;
// }

table {
	border-collapse: collapse;
}

input[type="text"]
{
    border-width:2px;  
    border-style:inset;
    width: 100%;
    padding: 2px;
    box-sizing: border-box;
    // color: -internal-light-dark-color(black, white);
    // letter-spacing: normal;
    // word-spacing: normal;
    // text-transform: none;
    // text-indent: 0px;
    // text-shadow: none;
    // -moz-box-sizing: border-box;
    // -webkit-box-sizing: border-box;
}

input[type="button"]
{
    border-radius: 3px;
    border-style:outset;
    padding: 3px;
    padding-left: 6px;
    padding-right: 6px;
    margin: 2px;
    box-sizing: border-box;

// 	-moz-appearance: push-button;
// 	-webkit-appearance: push-button;
// 	user-select: none;
// 	white-space: pre;
// 	align-items: flex-start;
// 	text-align: center;
// 	cursor: default;
// 	color: buttontext;
// 	background-color: buttonface;
// 	box-sizing: border-box;
// 	padding: 1px 7px 2px;
// 	border-width: 1px;
// 	border-style: solid;
// 	border-color: rgb(216, 216, 216) rgb(209, 209, 209) rgb(186, 186, 186);
// 	border-image: initial;

}

a {
	color:#000088;
	vlink:#000088;
	alink:#000088;
	text-decoration:none;
}

td, th {
	border: 0px solid #aaaaaa;
    	padding: 3px;
}

.table_label {
	width:45%;
}

.table_input {
	width:55%;
	vertical-align: baseline;
}
`
	document.body.appendChild(sheet)

	// create ui components
	let global = window.global

	// controls_div
	let controls_div = document.createElement('div')
	global.ui.controls_div = controls_div
	controls_div.id = 'controls_div'
	controls_div.style = 'position:absolute; width:225px; height:100%; left:0; background-color: '+COLOR_CONTROLS_BG+';'

	let table = controls_div.appendChild(document.createElement('table'))
	global.ui.table = table
	table.style='border-spacing:0px; width:100%;' //  cellpadding:2px; cellspacing:2px;'
	{
		// population
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerHTML='Population:'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let population_input = col.appendChild(document.createElement('input'));
			population_input.type = 'text'
			population_input.value = '100'
			global.ui.population_input = population_input
		}
	}

	{
		// initially sick 
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerHTML='Initially Sick:'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let initially_sick_input = col.appendChild(document.createElement('input'));
			initially_sick_input.type = 'text'
			initially_sick_input.value = '1'
			global.ui.initially_sick_input = initially_sick_input
		}
	}

	{
		// infection rates 
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerHTML='Contagion<br>Probabilities<br>(columns):'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let contagion_probs_input = col.appendChild(document.createElement('input'));
			contagion_probs_input.type = 'text'
			contagion_probs_input.value = '1 1/2 1/4 1/8'
			global.ui.contagion_probs_input = contagion_probs_input
		}
	}

	{
		// recovery steps 
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerHTML='Recovery<br>Distance (rows):'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let recovery_steps_input = col.appendChild(document.createElement('input'));
			recovery_steps_input.type = 'text'
			recovery_steps_input.value = '2 1'
			global.ui.recovery_steps_input = recovery_steps_input
		}
	}

	{
		// panel size 
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerHTML='Social<br>Distancing:'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let social_distancing_input = col.appendChild(document.createElement('input'));
			social_distancing_input.type = 'text'
			social_distancing_input.value = '0.10'
			global.ui.social_distancing_input = social_distancing_input
		}
	}

	{
		// radius
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerText='Radius:'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let radius_input = col.appendChild(document.createElement('input'));
			radius_input.type = 'text'
			radius_input.value = '3'
			global.ui.radius_input = radius_input
		}
	}

	{
		// panel size 
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerText='Panel Size:'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";
			let panel_size_input = col.appendChild(document.createElement('input'));
			panel_size_input.type = 'text'
			panel_size_input.value = '230'
			global.ui.panel_size_input = panel_size_input
		}
	}

	{
		// speed
		let row = table.appendChild(document.createElement('tr'))
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_label";
			let label = col.appendChild(document.createElement('label'));
			label.innerText='Speed:'
		}
		{
			let col = row.appendChild(document.createElement('td'));
			col.className="table_input";

			let speed_input = col.appendChild(document.createElement('input'));
			speed_input.type = 'text'
			speed_input.value = '2'
			global.ui.speed_input = speed_input
			window.addEventListener("keydown", function(e) {
				if (e.keyCode === KEY_ENTER) {
					if (document.activeElement == global.ui.speed_input) {
						let new_speed = parseInt(global.ui.speed_input.value)
						if (!isNaN(new_speed) && new_speed > 0 && new_speed < 1000) {
							global.speed = new_speed
						}
					}
				}
			})
		}
	}
	{
		// speed
		let row = table.appendChild(document.createElement('tr'))
		let col = row.appendChild(document.createElement('td'));
		col.colSpan=2
		col.style='text-align:center'
		{
			let btn = col.appendChild(document.createElement('input'));
			btn.type = 'button'
			btn.value = '1x'
			btn.addEventListener('click', function() {
				global.ui.speed_input.value=1
				global.speed=1
			});
		}
		{
			let btn = col.appendChild(document.createElement('input'));
			btn.type = 'button'
			btn.value = '2x'
			btn.addEventListener('click', function() {
				global.ui.speed_input.value=2
				global.speed=2
			});
		}
		{
			let btn = col.appendChild(document.createElement('input'));
			btn.type = 'button'
			btn.value = '4x'
			btn.addEventListener('click', function() {
				global.ui.speed_input.value=4
				global.speed=4
			});
		}
		{
			let btn = col.appendChild(document.createElement('input'));
			btn.type = 'button'
			btn.value = '8x'
			btn.addEventListener('click', function() {
				global.ui.speed_input.value=8
				global.speed=8
			});
		}
		{
			let btn = col.appendChild(document.createElement('input'));
			btn.type = 'button'
			btn.value = '16x'
			btn.addEventListener('click', function() {
				global.ui.speed_input.value=16
				global.speed=16
			});
		}
		{
			let btn = col.appendChild(document.createElement('input'));
			btn.type = 'button'
			btn.value = '32x'
			btn.addEventListener('click', function() {
				global.ui.speed_input.value=32
				global.speed=32
			});
		}
	}

	{
		// speed
		let row = table.appendChild(document.createElement('tr'))
		row.style='background-color:#666666; height:50px'
		let col = row.appendChild(document.createElement('td'));
		col.colSpan=2
		col.style='text-align:center; vertical-align: middle;'

		let msg_input = col.appendChild(document.createElement('input'));
		msg_input.type = 'button'
		msg_input.value = 'Info'
		msg_input.style.width="28%"
		msg_input.addEventListener('click', function() {
			ui_show_info(!global.show_info)
		});

		let reset_input = col.appendChild(document.createElement('input'));
		reset_input.type = 'button'
		reset_input.value = 'Reset'
		reset_input.style.width="28%"
		reset_input.addEventListener('click', function() {
			reset_simulation()
			update()
		});

		let play_input = col.appendChild(document.createElement('input'));
		play_input.type = 'button'
		play_input.value = 'Play'
		play_input.style.width="28%"
		play_input.addEventListener('click', function() {
			ui_show_info(false)
			if (!global.simulation) {
				reset_simulation()
				global.running = true
				global.ui.play_input.value = 'Pause'
				update()
			} else {
				global.running = !global.running
				global.ui.play_input.value = global.running ? 'Pause' : 'Play' 
				update()
			}
		});
		global.ui.play_input = play_input 
	}

	let info_div = controls_div.appendChild(document.createElement('div'))
	// info_div.style.fontClass="12 Monaco"
	info_div.style = "padding: 5px; line-height: 1.25;"
	info_div.innerHTML=`<div style='font:12px Monaco,Courier;'>
	cp: contagion prob. per <br>
	&nbsp;&nbsp;&nbsp;&nbsp;interaction<br>
	rd: recovery distance <br>
	    &nbsp;&nbsp;&nbsp;&nbsp;(x Panel Size)<br>
	it: iteration<br>
	pi: pairwise interactions<br>
	h:&nbsp; healthy<br>
	r:&nbsp; recovered<br>
	s:&nbsp; sick<br>
	Ms: max sick simultaneously<br>
	<br>
	</div>
	<div style="text-align:center"><a style="width:100%; text-align:center" href="https://github.com/laurolins/contagion_sim" target="_blank">Source Code</a></div>
	</p>`

	// <br>
	// - The same 'coin-flip' in each healthy-sick
	//   interaction is compared to the different
	//   contagion probabilities to define when
	//   to transmit the disease
	// var row = table.appendChild(document.createElement('tr'))
	// var column= row.appendChild(document.createElement('td'));
	// column.colSpan = 2
	// var polygon_input= column.appendChild(document.createElement('input'));
	// polygon_input.type = "button"
	// polygon_input.value = 'Create Polygon'
	// polygon_input.addEventListener('click', function() {
	// 	global.state = STATE_POLYGON_CREATION
	// 	global.polygon_being_created = { points:[] }
	// });
	// var export_input= column.appendChild(document.createElement('input'));
	// export_input.type = "button"
	// export_input.value = 'Export'
	// export_input.addEventListener('click', function() {
	// 	global.export_tile_numbers = true
	// 	global.events.push({ 'type':EVENT_REDRAW, version:0 })
	// });

	// info div
	let msg_div = document.createElement('div')
	global.ui.msg_div = msg_div
	msg_div.style = 'position:absolute; line-height:1.2; font-size:20px; width:calc(100% - 225px); left:225px; height:100%; background-color: '+COLOR_INFO_MSG+'; z-index:2; color:#000000; visibility:visible;'
	msg_div.innerHTML= `
	<div style="width:720px; margin-left:20px; margin-top:15px; background-color:#ffffff00;" >
	Inspired by <a target="_blank" href="https://twitter.com/Harry_Stevens">Harry Steven's</a>
	article on 
	<br> <br>
		<center>
		<a target="_blank" href="https://www.washingtonpost.com/graphics/2020/world/corona-simulator/">
		<i>Why outbreaks like coronavirus spread exponentially, <br>and how to "flatten the curve"</i>
		</a>
		</center>
	<br>

	here is another simulated world where we can control the <b>contagion probability</b> of the 
	interactions between a sick person and a healthy person.

	<br><br>

	<center>
	What is the effect on flattening the curve when the <br>contagion probability is reduced?
	</center>

	<br>

	Hit <b>Play</b> and you will see people (circles) moving around on eight panels (2-rows by
	4-columns array). People's movement and interactions (intersecting circles) are exactly the same 
	on all panels. On the columns, from left to right, the contagion probabilities
	per interaction are 1, 1/2, 1/4 and 1/8. On the rows we vary the recovery time 
	of a sick individual. The recovery time is defined in terms of the duration in
	which a moving individual covers a certain distance. On the top row this distance
	is twice the side of the panel (longer recovery) and on the bottom row this distance 
	is the side of the panel (faster recovery). 

	<br><br>

	When no more sick people exists in any panel, the simulation stops. Look at the time charts and compare
	the maximum number of simultaneously sick people in each panel (Ms value on the bottom right of each
	panel).

	<br><br>

	Note that reducing the contagion probability on interactions can flatten the curve
	significatively. In other words, any effective protection measure individuals take
	during interactions can have a big and positive aggregate effect.

	</div> `

	// main_div
	let main_div = document.createElement('div')
	global.ui.main_div = main_div
	main_div.id = 'main_div'
	main_div.style = 'position:absolute; width:calc(100% - 225px); left: 225px; height:100%; background-color: '+COLOR_SIMULATION_BG+';'

	let main_canvas = main_div.appendChild(document.createElement('canvas'))
	global.ui.main_canvas = main_canvas
	main_canvas.style='position: relative; left:0px; top:0px; z-index:1;'
	main_canvas.id = 'main_canvas'
	main_canvas.tabindex = '1'




	var body = document.getElementsByTagName('body')[0]
	global.ui.body = body
	body.style.margin='0px'
	body.appendChild(controls_div)
	body.appendChild(main_div)
	body.appendChild(msg_div)

	// function simulation_init(n, width, height, radius, contagion_probs, recovery_steps)
	// global.simulation = simulation_init(100, 3, 250, 250, [1, 0.5, 0.25], [125,250])

	setTimeout(update, 16)
}
