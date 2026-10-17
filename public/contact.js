(() => {
const cfg=window.SSA_CONFIG||{};
const email=typeof cfg.contactEmail==="string"?cfg.contactEmail.trim():"";
if(email&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){
 const copy=document.querySelector("#contact-email-copy"),link=document.querySelector("#contact-email-link");
 copy.textContent=email;link.href="mailto:"+email;link.classList.remove("hidden");
}
const url=typeof cfg.whatsappCommunityUrl==="string"?cfg.whatsappCommunityUrl.trim():"";
if(/^https:\\/\\//i.test(url)){
 const link=document.querySelector("#contact-community-link");link.href=url;link.classList.remove("hidden");document.querySelector("#contact-community-note").classList.add("hidden");
}
})();