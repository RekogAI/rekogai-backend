export const getIndexPageRoute = (req, res, next) => {
  console.log("I m controlling the request flow now");
  return res.render("index", { title: "Express" });
};
