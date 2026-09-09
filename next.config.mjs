const securityHeaders=[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), geolocation=(), microphone=(self)'},
  {key:'X-Frame-Options',value:'DENY'},
];

export default {
  async headers(){return [{source:'/:path*',headers:securityHeaders}];},
};
