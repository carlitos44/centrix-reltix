// Each option defines the context worth collecting and the action to take next.
const questionnaire = {
  repair: {
    select: 'What needs repairing?',
    title: 'Describe the fault',
    urgency: true,
    options: {
      'Water or plumbing': ['Which fixture or area?', 'What is leaking, blocked, or without water?', 'When did it start?', 'plumber', 'Identify the affected fixture and tell management if water is still escaping.'],
      'Power or electrical': ['Which room or circuit?', 'What lost power or stopped working?', 'When did it start?', 'electrician', 'Ask management whether the problem affects your unit or the wider building.'],
      'Heating or hot water': ['Which rooms or fixtures are affected?', 'Is the heating, hot water, or both affected?', 'When did it start?', 'heating', 'Tell management whether heating, hot water, or both are affected and ask for a repair visit.'],
      'Appliance or fixture': ['Which appliance or fixture?', 'What happens when you try to use it?', 'When did it start?', 'manager', 'Confirm whether the item is supplied by the property and report any visible error code.'],
      'Damp or water damage': ['Where is the damage visible?', 'What have you noticed about the damp or damage?', 'When did you first notice it?', 'manager', 'Note whether the affected area is spreading and ask management to arrange an inspection.'],
      'Door, window or lock malfunction': ['Which door, window, or lock?', 'Does it fail to open, close, or secure?', 'When did it start?', 'manager', 'Tell management whether the opening can still be secured and whether access is affected.'],
      'Other repair': ['Which part of the property?', 'What needs attention?', 'When did it start?', 'manager', 'Identify the affected item and ask management who can inspect it.']
    }
  },
  moveIn: {
    select: 'What do you need to arrange for move-in?',
    title: 'Plan your move-in',
    options: {
      'Keys and access': [null, 'What do you need for key collection or building access?', 'Move-in or key collection date', 'manager', 'Confirm where and when to collect keys or fobs, and what identification to bring.'],
      'Inspection and inventory': ['Which room or item, if applicable?', 'What would you like to document or check at handover?', 'Handover or inspection date', 'manager', 'Arrange a handover inspection and keep a copy of the signed condition report.'],
      'Report an issue at move-in': ['Which room or item is affected?', 'What was already damaged, missing, or working incorrectly?', 'When did you notice it?', 'manager', 'Ask management to add the issue to the move-in condition report and confirm who will address it.'],
      'Utilities and meters': ['Which utility or meter?', 'Do you need the meter location, starting readings, or help setting up service?', 'Move-in or supply start date', 'manager', 'Confirm the correct meter for your unit and record its starting reading on handover day.'],
      'Moving arrangements': ['Which entrance or loading area?', 'Do you need a loading bay, lift reservation, or help with access?', 'Preferred moving date', 'manager', 'Ask management about loading times, lift reservations, and moving vehicle access.']
    }
  },
  moveOut: {
    select: 'What do you need to arrange for move-out?',
    title: 'Plan your move-out',
    options: {
      'Notice and lease': [null, 'What would you like to confirm about giving notice or ending your lease?', 'Proposed move-out date', 'owner', 'Check the notice terms in your lease and ask the owner to confirm how to submit notice.'],
      'Inspection and cleaning': ['Which areas need attention?', 'Do you need to schedule an inspection or clarify cleaning expectations?', 'Preferred inspection date', 'manager', 'Request the checkout checklist and agree on an inspection time before handing over the unit.'],
      'Keys and final meters': ['Which keys, fobs, or meters?', 'What do you need to confirm about returning keys or recording final readings?', 'Handover date', 'manager', 'Ask where to return keys and fobs, and keep a record of the final meter readings.'],
      'Deposit follow-up': [null, 'What would you like clarified about the deposit, such as timing or a deduction?', 'Handover date', 'owner', 'Keep the handover report and ask the owner for a written deposit update or an itemized explanation.'],
      'Moving arrangements': ['Which entrance or loading area?', 'What do you need to move out, such as a lift booking or vehicle access?', 'Preferred moving date', 'manager', 'Confirm the move-out loading route, any lift reservation, and access for the moving vehicle.']
    }
  },
  access: {
    select: 'What kind of access help do you need?',
    title: 'Tell us what you need to access',
    options: {
      'Locked out': ['Which entrance are you at?', 'What happened and can you still enter the building?', null, 'locksmith', 'Use the building’s approved lockout contact and have proof of occupancy ready.'],
      'Lost key or fob': ['What type of key or fob is missing?', 'Do you need immediate access, a replacement, or to deactivate a lost fob?', null, 'manager', 'Ask management to deactivate a lost fob if applicable and confirm the replacement procedure.'],
      'Intercom or entry door': ['Which entrance or intercom?', 'Is the call, door release, or entry mechanism failing?', 'When did you notice it?', 'manager', 'Report the entrance and the exact failed function to building management.'],
      'Garage or shared access': ['Which garage or shared room?', 'Do you need permission, a new access device, or help with one that stopped working?', 'Date access is needed', 'manager', 'Confirm access eligibility and ask management to check the assigned key, fob, or permit.']
    }
  },
  services: {
    select: 'Which service are you looking for?',
    title: 'Tell us what service you need',
    options: {
      'Internet': [null, 'Are you setting up a new connection, switching providers, or getting help with an existing plan?', 'Preferred activation or support date', 'internet', 'For a new connection, check availability for your address. For existing service, contact your current provider.'],
      'Cleaning': ['Which space needs cleaning?', 'Are you looking for a one-time clean, regular visits, or a quote?', 'Preferred cleaning date', 'cleaning', 'Request a quote with the rooms, type of cleaning, and preferred timing.'],
      'Waste or recycling': [null, 'What are you disposing of, or which collection schedule do you need?', 'Preferred collection date, if booking', 'waste', 'Check the municipality’s collection rules and whether bulky waste requires a booking.'],
      'Parking or grounds': ['Which bay or outdoor area?', 'Are you looking for a parking permit, a visitor space, or grounds maintenance?', 'Date needed', 'manager', 'Ask management whether a permit, reservation, or grounds maintenance request is needed.']
    }
  },
  owner: {
    select: 'What would you like to ask the owner about?',
    title: 'Write your question for the owner',
    options: {
      'Lease question': ['Which lease term or section?', 'What would you like the owner to clarify?', 'Reply needed by', 'owner', 'Refer to the relevant lease section and ask for a written response.'],
      'Rent or payment question': ['Which charge or billing period?', 'Are you asking about an amount, due date, or payment record?', 'Payment due date', 'owner', 'Check the matching charge in Payments and reference the billing period in your question.'],
      'Other property question': [null, 'What would you like to ask or request?', 'Reply needed by', 'owner', 'Summarize what you need and ask the owner to confirm the next step in writing.']
    }
  }
};
