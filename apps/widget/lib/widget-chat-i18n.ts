/**
 * Visitor-facing copy for the widget chat UI.
 * Locale is derived from the browser (`navigator.language`); extend with org settings later if needed.
 */

export type WidgetUiLocale = "en" | "fr";

export function getWidgetUiLocale(): WidgetUiLocale {
  if (typeof navigator === "undefined") return "en";
  const primary = (navigator.language || "en").toLowerCase();
  if (primary.startsWith("fr")) return "fr";
  return "en";
}

export type WidgetUiCopy = {
  preparingResponse: string;
  teammateTimeoutBooking: string;
  matchingSpecialist: string;
  loadingAvailability: string;
  noTeammateNow: string;
  assignRightPerson: string;
  findingBestTime: string;
  noTimesNow: string;
  bookDemoDetails: string;
  oneSecReadyResend: string;
  preparingChatResend: string;
  networkHiccup: string;
  talkToSomeone: string;
  continueToChat: string;
  escalationSuggestion: string;
  bookMeeting: string;
  close: string;
  chatTitle: string;
  preferSpecialist: string;
  talkToSomeoneButton: string;
  continueToChatButton: string;
  assigningRep: string;
  consentBodyDefault: string;
  detailsDataProcessed: string;
  noAvailabilityFound: string;
  noAvailabilityTryLater: string;
  placeholderMessage: string;
  privacyDefaultTitle: string;
  hereLink: string;
  youAreBooked: (repName: string, meetingUrl: string) => string;
  meetingUrlFallback: string;
  consentLinkIntro: string;
  consentWithdrawFooter: string;
  repChange: string;
  yourTimezone: string;
  slotsNoAvailability: string;
  slotsNoAvailabilityLong: string;
  timesLocalTimezone: string;
  repPickerChoose: string;
  yourExpert: string;
  salesTeam: string;
  /** Fallback when rep name missing (booking confirmation). */
  ourTeam: string;
  calendarLoading: string;
  calendarNoAvailability: string;
  calendarTryAnother: string;
  calendarPickTime: string;
  calendarTimesTimezone: string;
  qualifyBookMeeting: string;
  qualifyIntro: string;
  qualifyName: string;
  qualifyEmail: string;
  qualifyCompany: string;
  qualifyRole: string;
  qualifyPhoneOptional: string;
  qualifyWhatAchieve: string;
  qualifyBriefPlaceholder: string;
  qualifyCancel: string;
  qualifySubmit: string;
  qualifyContinueArrow: string;
  qualifyCompanyPlaceholder: string;
  qualifyRolePlaceholder: string;
  qualifyPhonePlaceholder: string;
};

export const widgetUiCopy: Record<WidgetUiLocale, WidgetUiCopy> = {
  en: {
    preparingResponse:
      "One sec… I’m preparing the response.\n\nIf you’d rather speak to a human, just say it.",
    teammateTimeoutBooking:
      `⏳ If no teammate answers right away, you can book a quick meeting instead.\n` +
      `Click “Book a meeting” to pick a slot.`,
    matchingSpecialist: "Great — I’m matching you with the best specialist 👇",
    loadingAvailability: "One sec — loading availability…",
    noTeammateNow: "No teammate is available right now. Please try again later.",
    assignRightPerson: "Our team will assign the right person. Pick any time below 👇",
    findingBestTime: "Great — I’m finding the best available time for you 👇",
    noTimesNow: "No times are available right now. Please try again later.",
    bookDemoDetails: "Great! To book a demo, fill in these quick details.",
    oneSecReadyResend: "One sec… ready now. Please resend your message.",
    preparingChatResend: "Preparing the chat… please resend your message in a moment.",
    networkHiccup: "Network hiccup—please try again.",
    talkToSomeone: "I’d like to talk to someone.",
    continueToChat: "Continue to chat.",
    escalationSuggestion:
      "If you’d like to go deeper, I can connect you with a human teammate or help you book a quick meeting. Just say “talk to someone” or “meeting”.",
    bookMeeting: "Book a meeting",
    close: "Close",
    chatTitle: "Chat",
    preferSpecialist: "Prefer to talk to a specialist?",
    talkToSomeoneButton: "Talk to someone",
    continueToChatButton: "Continue to chat",
    assigningRep: "Assigning the best rep…",
    consentBodyDefault:
      "Before we begin, you need to provide consent to data processing that may occur in your chat session.",
    detailsDataProcessed: "Details about how your data may be processed.",
    noAvailabilityFound: "No availability found.",
    noAvailabilityTryLater: "No availability found right now. Please try again later.",
    placeholderMessage: "Write your message…",
    privacyDefaultTitle: "Privacy & data usage",
    hereLink: "here",
    youAreBooked: (repName, meetingUrl) =>
      `✅ You’re booked with ${repName}\nJoin with this link: ${meetingUrl}`,
    meetingUrlFallback: "Check your inbox for the invite.",
    consentLinkIntro:
      "I hereby consent to processing of my personal data collected in the chat in accordance with the rules described",
    consentWithdrawFooter: "\n\nYou can withdraw your consent at any time.",
    repChange: "← Change rep",
    yourTimezone: "Your timezone:",
    slotsNoAvailability: "No availability found.",
    slotsNoAvailabilityLong: "No availability found. Please try later.",
    timesLocalTimezone: "Times shown in your local timezone.",
    repPickerChoose: "Choose who you want to meet:",
    yourExpert: "Your expert",
    salesTeam: "Sales team",
    ourTeam: "our team",
    calendarLoading: "Loading availability…",
    calendarNoAvailability: "No availability",
    calendarTryAnother: "Try another period or contact us.",
    calendarPickTime: "Pick a time",
    calendarTimesTimezone: "Times in your local timezone",
    qualifyBookMeeting: "Book a meeting",
    qualifyIntro: "We’ll use this to tailor the call and match you with the right expert.",
    qualifyName: "Name",
    qualifyEmail: "Email",
    qualifyCompany: "Company",
    qualifyRole: "Role",
    qualifyPhoneOptional: "Phone (optional)",
    qualifyWhatAchieve: "What do you want to achieve?",
    qualifyBriefPlaceholder: "Brief context…",
    qualifyCancel: "Cancel",
    qualifySubmit: "Continue",
    qualifyContinueArrow: "Continue →",
    qualifyCompanyPlaceholder: "Acme Inc.",
    qualifyRolePlaceholder: "e.g. PM",
    qualifyPhonePlaceholder: "+33 6 12 34 56 78",
  },
  fr: {
    preparingResponse:
      "Un instant… je prépare la réponse.\n\nSi vous préférez parler à un humain, dites-le simplement.",
    teammateTimeoutBooking:
      `⏳ Si personne de l’équipe ne répond tout de suite, vous pouvez réserver un court rendez-vous.\n` +
      `Cliquez sur « Prendre rendez-vous » pour choisir un créneau.`,
    matchingSpecialist: "Parfait — je vous mets en relation avec le meilleur spécialiste 👇",
    loadingAvailability: "Un instant — chargement des disponibilités…",
    noTeammateNow: "Aucun membre de l’équipe n’est disponible pour le moment. Réessayez plus tard.",
    assignRightPerson:
      "Notre équipe assignera la bonne personne. Choisissez un créneau ci-dessous 👇",
    findingBestTime: "Parfait — je cherche le meilleur créneau disponible pour vous 👇",
    noTimesNow: "Aucun créneau n’est disponible pour le moment. Réessayez plus tard.",
    bookDemoDetails: "Parfait ! Pour réserver une démo, remplissez ces quelques informations.",
    oneSecReadyResend: "C’est prêt. Veuillez renvoyer votre message.",
    preparingChatResend:
      "Préparation du chat… veuillez renvoyer votre message dans un instant.",
    networkHiccup: "Problème réseau — veuillez réessayer.",
    talkToSomeone: "Je souhaite parler à quelqu’un.",
    continueToChat: "Continuer le chat.",
    escalationSuggestion:
      "Pour aller plus loin, je peux vous mettre en relation avec un membre de l’équipe ou vous aider à réserver un court rendez-vous. Dites simplement « parler à quelqu’un » ou « rendez-vous ».",
    bookMeeting: "Prendre rendez-vous",
    close: "Fermer",
    chatTitle: "Chat",
    preferSpecialist: "Vous préférez parler à un spécialiste ?",
    talkToSomeoneButton: "Parler à quelqu’un",
    continueToChatButton: "Continuer le chat",
    assigningRep: "Attribution du meilleur interlocuteur…",
    consentBodyDefault:
      "Avant de commencer, vous devez consentir au traitement des données susceptibles d’avoir lieu pendant cette conversation.",
    detailsDataProcessed: "Détails sur le traitement de vos données.",
    noAvailabilityFound: "Aucune disponibilité trouvée.",
    noAvailabilityTryLater: "Aucune disponibilité pour le moment. Réessayez plus tard.",
    placeholderMessage: "Écrivez votre message…",
    privacyDefaultTitle: "Confidentialité et données",
    hereLink: "ici",
    youAreBooked: (repName, meetingUrl) =>
      `✅ Rendez-vous confirmé avec ${repName}\nLien pour rejoindre : ${meetingUrl}`,
    meetingUrlFallback: "Vérifiez votre boîte mail pour l’invitation.",
    consentLinkIntro:
      "J’accepte le traitement de mes données personnelles collectées dans le chat conformément aux règles décrites",
    consentWithdrawFooter:
      "\n\nVous pouvez retirer votre consentement à tout moment.",
    repChange: "← Changer d’interlocuteur",
    yourTimezone: "Votre fuseau horaire :",
    slotsNoAvailability: "Aucune disponibilité trouvée.",
    slotsNoAvailabilityLong: "Aucune disponibilité trouvée. Réessayez plus tard.",
    timesLocalTimezone: "Horaires affichés dans votre fuseau local.",
    repPickerChoose: "Choisissez la personne que vous souhaitez rencontrer :",
    yourExpert: "Votre expert",
    salesTeam: "Équipe commerciale",
    ourTeam: "notre équipe",
    calendarLoading: "Chargement des disponibilités…",
    calendarNoAvailability: "Aucune disponibilité",
    calendarTryAnother: "Essayez une autre période ou contactez-nous.",
    calendarPickTime: "Choisir un horaire",
    calendarTimesTimezone: "Horaires dans votre fuseau local",
    qualifyBookMeeting: "Prendre rendez-vous",
    qualifyIntro:
      "Ces informations nous aident à préparer l’appel et à vous mettre en relation avec le bon expert.",
    qualifyName: "Nom",
    qualifyEmail: "E-mail",
    qualifyCompany: "Entreprise",
    qualifyRole: "Fonction",
    qualifyPhoneOptional: "Téléphone (optionnel)",
    qualifyWhatAchieve: "Quel est votre objectif ?",
    qualifyBriefPlaceholder: "Contexte en quelques mots…",
    qualifyCancel: "Annuler",
    qualifySubmit: "Continuer",
    qualifyContinueArrow: "Continuer →",
    qualifyCompanyPlaceholder: "Ex. Ma Société",
    qualifyRolePlaceholder: "ex. chef de projet",
    qualifyPhonePlaceholder: "+33 6 12 34 56 78",
  },
};

/** Locale string for `Intl` formatters (calendar, slots). */
export function intlLocaleForWidget(lang: WidgetUiLocale): string {
  return lang === "fr" ? "fr-FR" : "en-GB";
}
