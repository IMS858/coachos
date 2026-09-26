import {CAPTURE_UUID} from "@/lib/exercises/capture";
/** A pending item must remain reachable even when the client has more than 20 submissions. */
export function mediaReviewHref(mediaId:string):string{
 if(!CAPTURE_UUID.test(mediaId))throw new Error("Invalid coaching media reference");
 return "/coaching/media/"+mediaId;
}
