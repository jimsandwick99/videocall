// INCORRECT - Multi-line strings breaking syntax
approach = "34 VENEM 1A RNAV
34 VEMEM 2L RNAV (ATC)",

// CORRECT OPTION 1: Using string concatenation
approach = "34 VENEM 1A RNAV " +
           "34 VEMEM 2L RNAV (ATC)",

// CORRECT OPTION 2: Using raw strings (triple quotes)
approach = """34 VENEM 1A RNAV
34 VEMEM 2L RNAV (ATC)""",

// CORRECT OPTION 3: Using escape sequences
approach = "34 VENEM 1A RNAV\n34 VEMEM 2L RNAV (ATC)",

// For the threats list:
threats = listOf(
    "In case of last-minute delay consider increase speed/CI for OTP",
    "Non-standard AFC for Passenger announcements (Ihram), perform PA 30 min and 05 min before crossing Ihram zone.",
    "Expect ATC to announce parking bay as following: Apron Number \"slash\" Parking Bay e.g. parking bay 1 on Apron 7: \"7 slash 1\"",
    "Refueling with PAX boarding only with Fire brigade."
)