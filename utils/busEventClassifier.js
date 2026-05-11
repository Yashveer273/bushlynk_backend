function classifyBusEvent(distance, radius) {

  if (distance <= radius * 0.5) {
    return "ARRIVED";
  }

  if (distance <= radius) {
    return "ARRIVING";
  }

  return "LEFT";
}

module.exports = { classifyBusEvent };